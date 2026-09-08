import { NextResponse } from 'next/server'
import { proposeQualifyingQuestions } from '@/lib/llm/qualify'

/**
 * The qualifying set for a subject that is being sown. Fired the moment
 * the subject is named, while the user is still answering the rest of
 * the sheet, so the questions are waiting rather than being waited for.
 */
export async function POST(req: Request) {
  const { subject, roots, confident, depth } = await req.json()

  if (typeof subject !== 'string' || !subject.trim()) {
    return NextResponse.json({ error: 'subject is required' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set, so no questions can be written.' },
      { status: 503 }
    )
  }

  try {
    const questions = await proposeQualifyingQuestions({
      subject: subject.trim(),
      roots: typeof roots === 'number' ? roots : null,
      confident: typeof confident === 'string' ? confident : null,
      depth: typeof depth === 'string' ? depth : null,
    })
    return NextResponse.json({ questions })
  } catch (e) {
    // The rest of the sheet still works without these, so this fails
    // quietly rather than blocking the sowing.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not write the questions.' },
      { status: 502 }
    )
  }
}
