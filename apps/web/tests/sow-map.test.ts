import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))
vi.mock('@/lib/auth', () => ({ ownerId: async () => 'user-1' }))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => { throw new Error('the database should not be reached') }
}))

beforeEach(() => {
  mockCreate.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const post = async () => {
  const { POST } = await import('@/app/api/subjects/route')
  return POST(new Request('http://localhost/api/subjects', {
    method: 'POST',
    body: JSON.stringify({ subject: 'Photography', depth: 'I want to master it' }),
  }))
}

/** A map with topics on it, as the model hands one back. */
const aMap = {
  stop_reason: 'end_turn',
  usage: { output_tokens: 1300 },
  content: [{
    type: 'tool_use',
    name: 'record_subject_topics',
    input: { topics: [{ name: 'Exposure', summary: 'Light and time.', estimated_level: 2 }] },
  }],
}

/** A whole tool call that recorded nothing. */
const anEmptyMap = {
  stop_reason: 'end_turn',
  usage: { output_tokens: 12 },
  content: [{ type: 'tool_use', name: 'record_subject_topics', input: { topics: [] } }],
}

describe('a tool call cut off at the token ceiling', () => {
  it('is reported as half-written rather than crashing on a non-array', async () => {
    // What the SDK actually hands back when the JSON stops mid-list.
    mockCreate.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'tool_use', name: 'record_subject_topics', input: { topics: '[{"name":"Expo' } }],
    })

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/half-written/)
    // The same ceiling would cut the same answer off again, so it is
    // reported rather than retried.
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('still refuses a non-array even if stop_reason does not say so', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'tool_use', name: 'record_subject_topics', input: { topics: 'not a list' } }],
    })

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/came back empty/)
  })
})

describe('a map that comes back empty', () => {
  it('is asked for a second time, and the second answer stands', async () => {
    mockCreate.mockResolvedValueOnce(anEmptyMap).mockResolvedValueOnce(aMap)

    const res = await post()

    expect(mockCreate).toHaveBeenCalledTimes(2)
    // Past the map and into the sowing: the database mock is the only
    // thing that stopped it, which is the point of the assertion.
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/the database should not be reached/)
  })

  it('tells the model what it did rather than asking the same thing twice', async () => {
    mockCreate.mockResolvedValue(anEmptyMap)

    await post()

    const [first, second] = mockCreate.mock.calls.map(c => c[0].messages[0].content)
    expect(first).not.toMatch(/recorded no topics/)
    expect(second).toMatch(/recorded no topics/)
  })

  it('names what actually came back, rather than blaming the subject alone', async () => {
    mockCreate.mockResolvedValue(anEmptyMap)

    const res = await post()
    const { error } = await res.json()

    expect(res.status).toBe(502)
    expect(error).toMatch(/stop_reason end_turn/)
    expect(error).toMatch(/0 recorded, 0 usable/)
    expect(error).toMatch(/12 output tokens/)
  })
})

describe('an answer with no tool call in it', () => {
  it('is named as such and not retried', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      usage: { output_tokens: 40 },
      content: [{ type: 'text', text: 'I would rather talk about something else.' }],
    })

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/without filling the map in/)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})

describe('reading the answers, when the map did not', () => {
  /** A brief with answers on it, which is what makes a reading possible. */
  const readable = {
    subject: 'Personal Essays',
    roots: 1,
    confident: '',
    gaps: '',
    depth: '',
    qualifiers: [
      { prompt: 'What is a personal essay?', level: 1, probes: 'the form', answer: 'It is for readers.' },
      { prompt: 'Name an essayist.', level: 2, probes: 'a practitioner', answer: '' },
    ],
    evidence: [],
    sources: [],
  }

  /** What the reading call hands back when it is asked on its own. */
  const aReading = {
    stop_reason: 'tool_use',
    usage: { output_tokens: 460 },
    content: [{
      type: 'tool_use',
      name: 'record_reading',
      input: { level: 2, note: 'You hold the basics.', shown: ['the form'], missing: ['practitioners'] },
    }],
  }

  it('asks in a call of its own, and counts what was answered', async () => {
    mockCreate.mockResolvedValue(aReading)
    const { readTheAnswers } = await import('@/lib/sowing')

    const reading = await readTheAnswers(readable, Date.now() + 54_000)

    // A bed laid out to the letter crowds the optional field off the
    // map, so it is asked for separately rather than hoped for.
    expect(mockCreate.mock.calls[0][0].tool_choice.name).toBe('record_reading')
    expect(reading).toMatchObject({ level: 2, answered: 1, asked: 2 })
    // Only the answered one is put in front of the model, and the
    // skipped one is still counted.
    expect(mockCreate.mock.calls[0][0].messages[0].content).toContain('It is for readers.')
    expect(mockCreate.mock.calls[0][0].messages[0].content).toMatch(/left 1 of the 2/)
  })

  it('is not asked for at all when the sheet came back blank', async () => {
    const { readTheAnswers } = await import('@/lib/sowing')

    expect(await readTheAnswers({ ...readable, qualifiers: [] }, Date.now() + 54_000)).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('gives the bed up rather than the minute, when the clock is nearly out', async () => {
    const { readTheAnswers } = await import('@/lib/sowing')

    // The planting still has to happen. A reading is the lesser thing.
    expect(await readTheAnswers(readable, Date.now() + 3_000)).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('leaves the bed standing when the reading call fails', async () => {
    mockCreate.mockRejectedValue(new Error('overloaded'))
    const { readTheAnswers } = await import('@/lib/sowing')

    expect(await readTheAnswers(readable, Date.now() + 54_000)).toBeNull()
  })
})
