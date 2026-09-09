'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SheetNav } from '@/components/SheetNav'
import { RootsGauge, ROOT_STAGES } from '@/components/RootsGauge'
import { readJson } from '@/lib/http'
import { ProofOfRoots, type ProofEntry } from './ProofOfRoots'
import styles from './page.module.css'

/**
 * Sowing takes the better part of a minute -- an LLM call, an
 * embedding per topic and a similarity search per topic -- and a
 * button that only says it is busy for that long reads as a button
 * that has died. So it reports the work in the same voice as the rest
 * of the sheet.
 *
 * None of this corresponds to a real step. It is a gardener's rumour
 * of one, and it is deliberately not a progress bar: a bar that cannot
 * know the total lies about how much is left, and this cannot know.
 * ponytail: a plain rotation, no easing, no percentage. If the real
 * stages ever become legible, report those instead.
 */
const LABOURS = [
  'Turning the ground…',
  'Sifting the seed…',
  'Reading the packet…',
  'Consulting the almanac…',
  'Squinting at the light…',
  'Measuring the drills…',
  'Arguing with the compost…',
  'Spacing the rows…',
  'Naming the seedlings…',
  'Filing the labels…',
  'Watering in…',
  'Standing back…',
]

interface QualifyingQuestion {
  prompt: string
  level: number
  /** What a good answer would show. Never printed — under the question
   *  it was a crib, and half of them gave the answer away. It is sent
   *  back with the answers as the rubric the marking reads against. */
  probes: string
}

const DEPTH_PICKS = [
  {
    label: 'Just curious',
    text: 'Just curious. I want the shape of the field and enough to follow a conversation, not the details.',
  },
  {
    label: 'Enough to work in it',
    text: 'Enough to work in it confidently on real projects, without needing the documentation open the whole time.',
  },
  {
    label: 'All the way',
    text: 'All the way. I want to master this, including the awkward corners a survey would skip.',
  },
]

/**
 * Sowing a subject. The sheet asks four things in the order they are
 * worth asking: how deep the roots already go, what has taken, where
 * the ground is thin, and how far it should be grown. Naming the
 * subject sets the agent writing a qualifying set in the background, so
 * by the time the user reaches the bottom of the sheet there are real
 * questions about the subject waiting rather than a spinner.
 *
 * Every field is optional. A subject named and nothing else still lays
 * out a bed — it just rests on the name alone, and says so.
 */
export default function NewSubjectPage() {
  const [subject, setSubject] = useState('')
  /** The subject as committed. Null until the main box is submitted. */
  const [named, setNamed] = useState<string | null>(null)

  const [roots, setRoots] = useState(0)
  const [rootsSet, setRootsSet] = useState(false)
  const [confident, setConfident] = useState('')
  const [gaps, setGaps] = useState('')
  const [depth, setDepth] = useState('')
  const [proof, setProof] = useState<ProofEntry[]>([])

  const [questions, setQuestions] = useState<QualifyingQuestion[]>([])
  const [qualifying, setQualifying] = useState<'idle' | 'writing' | 'ready' | 'failed'>('idle')
  const [answers, setAnswers] = useState<string[]>([])

  const [busy, setBusy] = useState(false)
  const [labour, setLabour] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /** A bed that was laid out, but not cleanly. Held here rather than
   *  navigated past, because a warning nobody reads is a warning that
   *  may as well not have been written. */
  const [partial, setPartial] = useState<{ href: string; warnings: string[] } | null>(null)
  const router = useRouter()

  // Steps on while the request is out. The reset happens where the
  // sowing starts rather than here: setting state straight from an
  // effect costs a second render for a number nobody is looking at.
  useEffect(() => {
    if (!busy) return
    const tick = setInterval(() => setLabour(n => n + 1), 2600)
    return () => clearInterval(tick)
  }, [busy])

  async function writeQuestions(name: string) {
    setQualifying('writing')
    try {
      const res = await fetch('/api/subjects/qualify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: name }),
      })
      const { ok, body } = await readJson<{ questions?: QualifyingQuestion[] }>(res)
      if (!ok || !Array.isArray(body.questions) || body.questions.length === 0) {
        throw new Error('empty set')
      }
      setQuestions(body.questions)
      setAnswers(Array(body.questions.length).fill(''))
      setQualifying('ready')
    } catch {
      // The rest of the sheet stands on its own, so a failure here is a
      // missing section rather than a broken form.
      setQualifying('failed')
    }
  }

  function name() {
    const trimmed = subject.trim()
    if (!trimmed) return
    setNamed(trimmed)
    writeQuestions(trimmed)
  }

  function amend() {
    setNamed(null)
    setQuestions([])
    setAnswers([])
    setQualifying('idle')
  }

  async function submit() {
    setBusy(true)
    setLabour(0)
    setError(null)
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: named,
          // Untouched is not the same answer as nought: nought says
          // there is nothing here, and the slider not having been moved
          // says nothing at all.
          roots: rootsSet ? roots : null,
          confident,
          gaps,
          depth,
          evidence: proof.map(p => ({
            resourceId: p.resourceId,
            title: p.title,
            kind: p.kind,
          })),
          qualifiers: questions.map((q, i) => ({
            prompt: q.prompt,
            level: q.level,
            probes: q.probes,
            answer: answers[i] ?? '',
          })),
        }),
      })
      const { ok, body, error: failed } = await readJson<{
        subjectId?: string
        reading?: boolean
        warnings?: string[]
      }>(res)
      if (!ok || !body.subjectId) throw new Error(failed ?? 'Could not draw the map.')

      // Straight to the reading when there is one — the comparison
      // between what they said and what their answers showed is the
      // point of having asked.
      const href = body.reading
        ? `/subjects/${body.subjectId}/reading`
        : `/subjects/${body.subjectId}`

      if (body.warnings?.length) {
        setPartial({ href, warnings: body.warnings })
        setBusy(false)
        return
      }

      router.push(href)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  const answered = answers.filter(a => a.trim()).length

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="sow" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Sow a subject</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <p className={styles.lead}>
          Name what you want to learn. A few questions about where you stand,
          and the app lays out a bed for it — topics, connections, and an
          honest first guess at what you already know.
        </p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="subject">
            The subject
          </label>
          {named ? (
            <div className={styles.namedRow}>
              <span className={styles.named}>{named}</span>
              <button type="button" className={styles.amend} onClick={amend}>
                Amend
              </button>
            </div>
          ) : (
            <>
              <input
                id="subject"
                className={styles.input}
                value={subject}
                onChange={e => setSubject(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && name()}
                placeholder="React, or Milton Friedman, or medium format"
                autoFocus
              />
              <div className={styles.nameRow}>
                <button
                  type="button"
                  className={styles.submit}
                  onClick={name}
                  disabled={!subject.trim()}
                >
                  Name it
                </button>
                <p className={styles.note}>
                  Naming it sets the agent writing a set of questions about the
                  subject while you answer the rest.
                </p>
              </div>
            </>
          )}
        </div>

        {named && (
          <div className={styles.questions}>
            <div className={styles.field} style={{ '--i': 0 } as React.CSSProperties}>
              <RootsGauge
                value={roots}
                onChange={next => {
                  setRoots(next)
                  setRootsSet(true)
                }}
              />
            </div>

            <div className={styles.field} style={{ '--i': 1 } as React.CSSProperties}>
              <label className={styles.label} htmlFor="confident">
                What has already taken?
              </label>
              <p className={styles.hint}>
                The parts you could explain to somebody else without looking
                them up. Be honest rather than modest; the map is only useful
                if it is true.
              </p>
              <textarea
                id="confident"
                className={styles.textarea}
                value={confident}
                onChange={e => setConfident(e.target.value)}
              />
              <ProofOfRoots entries={proof} onChange={setProof} />
            </div>

            <div className={styles.field} style={{ '--i': 2 } as React.CSSProperties}>
              <label className={styles.label} htmlFor="gaps">
                Where is the ground thin?
              </label>
              <p className={styles.hint}>
                What you have bounced off, avoided, or never got round to. The
                gaps are the point.
              </p>
              <textarea
                id="gaps"
                className={styles.textarea}
                value={gaps}
                onChange={e => setGaps(e.target.value)}
              />
            </div>

            <div className={styles.field} style={{ '--i': 3 } as React.CSSProperties}>
              <label className={styles.label} htmlFor="depth">
                How far do you want to grow it?
              </label>
              <p className={styles.hint}>
                A window box or an orchard. This decides how broadly the bed is
                laid out and how finely it is cut — curiosity gets a wide,
                shallow spread; mastery gets fewer, deeper rows.
              </p>
              <div className={styles.picks}>
                {DEPTH_PICKS.map(pick => (
                  <button
                    key={pick.label}
                    type="button"
                    className={`${styles.chip} ${depth === pick.text ? styles.chipOn : ''}`}
                    onClick={() => setDepth(depth === pick.text ? '' : pick.text)}
                    aria-pressed={depth === pick.text}
                  >
                    {pick.label}
                  </button>
                ))}
              </div>
              <textarea
                id="depth"
                className={styles.textarea}
                value={depth}
                onChange={e => setDepth(e.target.value)}
                placeholder="Or say it in your own words."
              />
            </div>

            <section className={styles.qualifying} style={{ '--i': 4 } as React.CSSProperties}>
              <div className={styles.qualifyingHead}>
                <h2 className={styles.qualifyingTitle}>Qualifying questions</h2>
                <span className={styles.qualifyingNote}>
                  {qualifying === 'ready'
                    ? `${questions.length} questions · ${answered} answered · easiest first`
                    : 'Easiest first'}
                </span>
              </div>

              {qualifying === 'writing' && (
                <p className={styles.waiting}>
                  Writing questions about {named}
                  <span className={styles.ellipsis} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </p>
              )}

              {qualifying === 'failed' && (
                <p className={styles.empty}>
                  No questions this time.{' '}
                  <button
                    type="button"
                    className={styles.retry}
                    onClick={() => writeQuestions(named)}
                  >
                    Ask again
                  </button>
                  , or carry on without them — everything here is optional.
                </p>
              )}

              {qualifying === 'ready' && (
                <>
                  <p className={styles.hint}>
                    Answer what you can and skip what you cannot. Nothing is
                    marked; where you stop is itself the useful part.
                  </p>
                  <ol className={styles.qualifyingList}>
                    {questions.map((question, i) => (
                      <li key={question.prompt} className={styles.qualifyingItem}>
                        <div className={styles.qualifyingRow}>
                          <span
                            className={styles.rung}
                            aria-label={`Difficulty ${question.level} of 5`}
                          >
                            {question.level}
                          </span>
                          <div className={styles.qualifyingBody}>
                            <label
                              className={styles.qualifyingPrompt}
                              htmlFor={`qualifier-${i}`}
                            >
                              {question.prompt}
                            </label>
                            <textarea
                              id={`qualifier-${i}`}
                              className={styles.textarea}
                              value={answers[i] ?? ''}
                              onChange={e =>
                                setAnswers(a =>
                                  a.map((v, j) => (j === i ? e.target.value : v))
                                )
                              }
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          </div>
        )}

        {error && (
          <div className={styles.problem}>
            <h2 className={styles.problemTitle}>Could not sow it</h2>
            <p className={styles.problemNote}>{error}</p>
          </div>
        )}

        {partial && (
          <div className={styles.partial}>
            <h2 className={styles.problemTitle}>Sown, with something to say</h2>
            <ul className={styles.partialList}>
              {partial.warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.submit}
              onClick={() => router.push(partial.href)}
            >
              Go to the bed
            </button>
          </div>
        )}

        {named && (
          <div className={styles.actions}>
            <button className={styles.submit} onClick={submit} disabled={busy}>
              {busy ? LABOURS[labour % LABOURS.length] : 'Lay out the bed'}
            </button>
            <p className={styles.note}>
              {rootsSet
                ? `Your answers set a first figure only — ${ROOT_STAGES[roots].label.toLowerCase()}, on your own reading. Real reading and real work overwrite it.`
                : 'Your answers set a first figure only. Real reading and real work overwrite it.'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
