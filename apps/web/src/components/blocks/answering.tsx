'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { didactic } from '@didactic/api'
import { questionKey } from '@didactic/core/answers'

const api = didactic()

/**
 * The channel a question block answers down.
 *
 * Three blocks ask something with a right answer, and all three need
 * the same two things: whether this question has been answered before,
 * and somewhere to say that it has been now. Threading that through
 * `Prose` would mean every block taking props it does not use, so it
 * travels as context instead -- provided by whatever is showing the
 * lesson, and absent everywhere else.
 *
 * Absent is a real case and the blocks must work in it: a refresher
 * renders the same components and has no lesson to record against. With
 * no provider the questions still ask, still mark themselves right or
 * wrong, and still explain -- they simply do not count for anything,
 * which is exactly what they did before any of this existed.
 */
interface Answering {
  /** What has already been answered here, by question key. */
  answered: Record<string, boolean>
  /** Record an answer. Returns whether it counted -- that is, whether
   *  it was the first one, and so whether it was worth anything. */
  record: (question: string, correct: boolean) => Promise<AnswerOutcome>
}

export interface AnswerOutcome {
  counted: boolean
  /** Whether a first right answer actually moved the figure. It does
   *  not for a scaffolding lesson, which is attached to no topic. */
  paid: boolean
}

const NOT_RECORDING: Answering = {
  answered: {},
  record: async () => ({ counted: false, paid: false }),
}

const Channel = createContext<Answering>(NOT_RECORDING)

/**
 * Let the questions in this lesson count.
 *
 * What is held here is only what this session has done: the map from
 * the server is the durable record, and a question answered a moment
 * ago is merged over it so the page does not need to re-read the lesson
 * to stop offering a boost it has already paid.
 */
export function Answering({
  lessonId,
  answered,
  children,
}: {
  lessonId: string
  /** Which of this lesson's questions were already answered, from the
   *  server. Without it a question answered yesterday reads as fresh
   *  today and the reader is told it counted when it did not. */
  answered: Record<string, boolean>
  children: React.ReactNode
}) {
  const [here, setHere] = useState<Record<string, boolean>>({})

  const record = useCallback(
    async (question: string, correct: boolean): Promise<AnswerOutcome> => {
      const key = questionKey(question)
      // Closed the moment it is pressed, rather than when the server
      // answers: the reader is reading the explanation by then, and a
      // second press in that window must not be able to pay twice.
      setHere(h => (key in h ? h : { ...h, [key]: correct }))

      const { ok, body } = await api.lessons.answer(lessonId, key, correct)
      if (!ok) return { counted: false, paid: false }
      return { counted: body.counted, paid: body.exposureWritten }
    },
    [lessonId]
  )

  const value = useMemo(
    () => ({ answered: { ...answered, ...here }, record }),
    [answered, here, record]
  )

  return <Channel.Provider value={value}>{children}</Channel.Provider>
}

/**
 * What a question block needs to know about its own question.
 *
 * `already` is true where this question was answered before the reader
 * pressed -- which is what decides whether the block may offer a boost
 * or has to say the question is closed.
 *
 * Before the press, and that is the whole of this.
 * -----------------------------------------------------------------
 *
 * It used to read the channel live: `key in answered`, evaluated at
 * render. And the channel closes a question the moment it is pressed
 * rather than when the server answers, deliberately, so that a second
 * press while the reader is reading the explanation cannot pay twice.
 * Those two are the bug. Pressing an answer put the key into
 * `answered`, that re-rendered the block, and `already` was true by the
 * time the block printed what the answer had been worth -- so every
 * first answer to every question was met with *you have answered this
 * one before, so it counts for nothing now*, which was not true and was
 * the opposite of what had just happened. The boost was real and
 * entered; only the sentence under it was wrong. Nothing in the record
 * was ever affected, which is why this survived: the figures were
 * right, and only the reader was misinformed.
 *
 * So the value is latched at the press. `atPress` holds what was true
 * when the reader last answered, and the block's own answer arriving in
 * the channel a moment later cannot come back as evidence that they had
 * answered before.
 *
 * Asking again still works, and reads correctly the second time: the
 * second press latches what is by then genuinely true, so it says the
 * question is closed and sends nothing.
 */
export function useQuestion(question: string | undefined) {
  const { answered, record } = useContext(Channel)
  const key = question ? questionKey(question) : null
  const live = key !== null && key in answered

  // Null until the reader has pressed, which is when the live reading
  // is still the honest one.
  const [atPress, setAtPress] = useState<boolean | null>(null)

  return {
    already: atPress ?? live,
    record: useCallback(
      (correct: boolean): Promise<AnswerOutcome> => {
        setAtPress(live)
        // A question already closed is not sent again. The server would
        // refuse it anyway -- the unique index is what actually decides
        // this -- but a request whose answer is known is a request not
        // worth making.
        if (live || !question) return Promise.resolve({ counted: false, paid: false })
        return record(question, correct)
      },
      [live, question, record]
    ),
  }
}
