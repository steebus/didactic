#!/usr/bin/env python3
"""Read lessons aloud.

This runs on a machine of the reader's own, not on the web host. It is
the other half of `/api/lessons/[id]/audio`: that route puts a row in
`lesson_audio` saying what to say, and this takes it, says it, and
pushes the files back to Supabase storage.

It polls. That is not laziness -- the machine has no inbound route at
all, so nothing can call it, and a queue read over an outbound
connection is the only shape that works. It also means the same worker
serves a laptop on localhost and the deployed web without knowing which
is which: neither of them ever talks to this process.

What it does not do is decide what to say. The chunking lives in
`packages/core/src/speech.ts`, where it has tests, and arrives here on
the row as `script`. Two implementations of "what is speakable" would
drift the first time a block was added.

Run it under systemd (see voice-worker.service). It holds the model in
memory between lessons, which is the whole reason it is a daemon: a
cold load is five seconds and every lesson would pay it.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
import time
import traceback
import wave

import imageio_ffmpeg
import numpy as np
import requests

# How long to wait between polls when there was nothing to do. Short
# enough that pressing Listen feels answered, long enough that an idle
# machine is not talking to Supabase constantly.
IDLE_SECONDS = 10

# How often to say "still here" while working through a lesson. A row
# whose heartbeat has gone quiet for longer than STALE_SECONDS is taken
# to belong to a worker that died, and may be claimed again.
BEAT_SECONDS = 20
STALE_SECONDS = 180

# Voices are loaded once and kept: `get_state_for_audio_prompt` is slow
# enough to matter per lesson and not per chunk.
_voices: dict[str, object] = {}

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "lesson-audio"

REST = f"{SUPABASE_URL}/rest/v1"
STORAGE = f"{SUPABASE_URL}/storage/v1"

# The service role bypasses row level security, which is what lets this
# poll the queue at all. It is why this file only ever runs on a machine
# the reader controls, and why the key is read from the environment
# rather than written anywhere.
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

session = requests.Session()
session.headers.update(HEADERS)


def now() -> str:
    """This moment, as a timestamp PostgREST will store as one.

    Written out rather than sent as the string "now()": a JSON body is
    values, not SQL, so `now()` would be stored as those six characters
    and every heartbeat comparison would fail. The clock is this
    machine's, which is the one doing the work.
    """
    return time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())


def log(*parts: object) -> None:
    """Say what is happening, with a timestamp journalctl can sort by."""
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def claim() -> dict | None:
    """Take the oldest voicing nobody is working on.

    Two states are claimable. `queued` is the ordinary one. `voicing`
    whose heartbeat has gone stale is a lesson whose worker died part
    way -- the chunks it finished are already saved and are not made
    again, so picking it back up resumes rather than restarts.

    The claim is a conditional update: `state=eq.queued` in the filter
    means two workers racing produce one winner and one empty response,
    without a lock or a transaction.
    """
    stale = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - STALE_SECONDS))

    # Queued first, then abandoned. Each is (the filter that finds one,
    # the state it must still be in when the claim lands).
    hunts = (
        ({"state": "eq.queued"}, "eq.queued"),
        (
            {"state": "eq.voicing", "or": f"(heartbeat_at.is.null,heartbeat_at.lt.{stale})"},
            "eq.voicing",
        ),
    )

    for find, must_be in hunts:
        found = session.get(
            f"{REST}/lesson_audio",
            params={**find, "select": "id", "order": "created_at.asc", "limit": "1"},
            timeout=30,
        )
        found.raise_for_status()
        rows = found.json()
        if not rows:
            continue

        # Claimed by id, with the state still in the filter: PATCH takes
        # no `limit`, so the row is chosen first and then claimed only
        # if it is still in the state it was found in. Two workers
        # racing produce one winner and one empty response -- no lock,
        # no transaction.
        taken = session.patch(
            f"{REST}/lesson_audio",
            params={"id": f"eq.{rows[0]['id']}", "state": must_be},
            json={"state": "voicing", "claimed_at": now(), "heartbeat_at": now()},
            headers={"Prefer": "return=representation"},
            timeout=30,
        )
        taken.raise_for_status()
        claimed = taken.json()
        if claimed:
            return full(claimed[0]["id"])

    return None


def full(audio_id: str) -> dict | None:
    """Everything needed to voice one lesson."""
    got = session.get(
        f"{REST}/lesson_audio",
        params={"id": f"eq.{audio_id}", "select": "id,user_id,lesson_id,voice,script,chunks"},
        timeout=30,
    )
    got.raise_for_status()
    rows = got.json()
    return rows[0] if rows else None


def beat(audio_id: str) -> None:
    """Say the worker is still alive, so nobody else takes this row."""
    session.patch(
        f"{REST}/lesson_audio",
        params={"id": f"eq.{audio_id}"},
        json={"heartbeat_at": now()},
        timeout=30,
    )


def done_indexes(audio_id: str) -> set[int]:
    """Which chunks are already made.

    Read rather than assumed, so a resumed lesson does not pay for
    minutes of audio that are already sitting in the bucket.
    """
    got = session.get(
        f"{REST}/lesson_audio_chunks",
        params={"audio_id": f"eq.{audio_id}", "select": "idx"},
        timeout=30,
    )
    got.raise_for_status()
    return {row["idx"] for row in got.json()}


def to_mp3(pcm: np.ndarray, rate: int) -> bytes:
    """PCM to mp3, through ffmpeg.

    mp3 rather than the wav the model produces: a lesson is twelve
    minutes of speech, wav is ten times the size for no gain anyone can
    hear on a phone, and every browser seeks mp3 without argument.

    64k mono is the rate speech is usually shipped at -- podcast voice
    tracks live here -- and the difference against anything higher is
    inaudible on one voice with no music behind it.
    """
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(pcm, -1, 1) * 32767).astype("<i2").tobytes())

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out = subprocess.run(
        [ffmpeg, "-loglevel", "error", "-i", "pipe:0", "-codec:a", "libmp3lame",
         "-b:a", "64k", "-ac", "1", "-f", "mp3", "pipe:1"],
        input=buf.getvalue(),
        capture_output=True,
        check=True,
    )
    return out.stdout


def put(path: str, data: bytes) -> None:
    """Push one file to the bucket, replacing anything already there.

    Retried, because the thing being protected is expensive and the
    failure is cheap and common. Storage sits behind a CDN that returns
    the occasional 520 or 503 with nothing wrong at either end, and
    without this a blip on chunk five throws away the four minutes of
    audio already made and tells the reader the lesson failed. Three
    goes with a widening gap covers what these are: momentary.

    Only the transient statuses. A 400 or a 403 is a real answer -- the
    path is wrong, the key is wrong -- and trying it twice more just
    delays finding that out.
    """
    for attempt in range(3):
        try:
            res = session.post(
                f"{STORAGE}/object/{BUCKET}/{path}",
                data=data,
                headers={
                    "Content-Type": "audio/mpeg",
                    # A resumed lesson may re-make a chunk whose row
                    # never landed; upsert makes that harmless rather
                    # than a conflict.
                    "x-upsert": "true",
                },
                timeout=120,
            )
            if res.status_code < 400:
                return
            if res.status_code not in (429, 500, 502, 503, 504, 520, 522, 524):
                raise RuntimeError(f"storage {res.status_code}: {res.text[:200]}")
            trouble = f"storage {res.status_code}"
        except requests.RequestException as e:
            # A dropped connection is the same kind of momentary as a
            # 520, and reads as one here.
            trouble = f"storage {type(e).__name__}"

        if attempt == 2:
            raise RuntimeError(f"{trouble}, three times")
        log(f"  {trouble}, going again")
        time.sleep(2 * (attempt + 1))


def finish(audio_id: str, state: str, reason: str | None = None) -> None:
    session.patch(
        f"{REST}/lesson_audio",
        params={"id": f"eq.{audio_id}"},
        json={"state": state, "reason": reason, "finished_at": now()},
        timeout=30,
    )


def voice_for(model, name: str):
    if name not in _voices:
        log("loading voice", name)
        _voices[name] = model.get_state_for_audio_prompt(name)
    return _voices[name]


def speak(model, row: dict) -> None:
    """Say one lesson, a chunk at a time.

    Each chunk is saved the moment it exists, which is what lets the
    player start on the first while the rest are still being made. It is
    also what makes a crash cheap: the work already done is on the row,
    not in this process.
    """
    audio_id = row["id"]
    script = row.get("script") or []
    if not script:
        finish(audio_id, "failed", "Nothing to say: the lesson had no script.")
        return

    voice = voice_for(model, row.get("voice") or "alba")
    already = done_indexes(audio_id)
    last_beat = time.time()

    for piece in script:
        idx = piece["index"]
        if idx in already:
            continue

        started = time.time()
        pcm = model.generate_audio(voice, piece["text"])
        seconds = len(pcm) / model.sample_rate

        path = f"{row['user_id']}/{row['lesson_id']}/{audio_id}-{idx:03d}.mp3"
        put(path, to_mp3(pcm.numpy(), model.sample_rate))

        # The row goes up only once the file is there, so a chunk that
        # exists in the table can always be played.
        made = session.post(
            f"{REST}/lesson_audio_chunks",
            json={
                "audio_id": audio_id,
                "idx": idx,
                "path": path,
                "seconds": round(seconds, 2),
                "text": piece["text"],
            },
            headers={"Prefer": "resolution=merge-duplicates"},
            timeout=30,
        )
        if made.status_code >= 400:
            raise RuntimeError(f"chunk row {made.status_code}: {made.text[:200]}")

        took = time.time() - started
        log(f"  chunk {idx}: {seconds:.0f}s audio in {took:.0f}s ({seconds / max(took, 0.01):.2f}x)")

        if time.time() - last_beat > BEAT_SECONDS:
            beat(audio_id)
            last_beat = time.time()

    finish(audio_id, "ready")
    log("ready:", audio_id)


def main() -> int:
    from pocket_tts import TTSModel

    log("loading model")
    model = TTSModel.load_model()
    log("model ready; polling")

    while True:
        try:
            row = claim()
            if not row:
                time.sleep(IDLE_SECONDS)
                continue

            log("voicing", row["id"], f"({len(row.get('script') or [])} chunks)")
            try:
                speak(model, row)
            except Exception as e:  # one lesson failing is not the worker failing
                traceback.print_exc()
                finish(row["id"], "failed", str(e)[:300])

        except KeyboardInterrupt:
            log("stopping")
            return 0
        except Exception:
            # The queue itself is unreachable, or Supabase is down. Wait
            # and try again rather than dying: systemd would restart
            # this into the same wall.
            traceback.print_exc()
            time.sleep(IDLE_SECONDS)


if __name__ == "__main__":
    sys.exit(main())
