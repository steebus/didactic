import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }))

const { effortFrom } = await import('@/lib/effort')

/**
 * The effort figures, read off a map written out by hand: which
 * material counts as about one topic, where a target and roots come
 * from, and how a bed adds up.
 */
const base = {
  topics: [
    { id: 'js', ability: 1, confidence: 0 },
    { id: 'react', ability: 3, confidence: 0.8 },
    { id: 'hooks', ability: 1, confidence: 0 },
    { id: 'loose', ability: 1, confidence: 0 },
  ],
  edges: [
    { from: 'js', to: 'react', kind: 'prereq', createdBy: 'user' },
    { from: 'react', to: 'hooks', kind: 'specialises', createdBy: 'ai' },
  ],
  memberships: [
    { topic_id: 'js', subject_id: 'web' },
    { topic_id: 'react', subject_id: 'web' },
    { topic_id: 'hooks', subject_id: 'web' },
    { topic_id: 'react', subject_id: 'ui' },
  ],
  subjects: [
    { id: 'web', title: 'Web development' },
    { id: 'ui', title: 'Interfaces' },
  ],
  roots: new Map([['web', 2]]),
  links: [
    { resource_id: 'tutorial', topic_id: 'hooks' },
    { resource_id: 'survey', topic_id: 'js' },
    { resource_id: 'survey', topic_id: 'react' },
  ],
  topicTargets: new Map<string, number>(),
  subjectTargets: new Map([['web', 4], ['ui', 3]]),
  words: new Map([['tutorial', 8000], ['survey', 20000]]),
}

describe('effortFrom', () => {
  const map = effortFrom(base)

  it('counts material toward a topic only when it is filed under that topic alone', () => {
    const signals = (id: string) => map.topics[id].inherent.contributions.map(c => c.signal)
    expect(signals('hooks')).toContain('material')
    expect(signals('js')).not.toContain('material')
    expect(signals('react')).not.toContain('material')
  })

  it('lengthens a topic with a prerequisite chain under it', () => {
    expect(map.topics.react.inherent.hours).toBeGreaterThan(map.topics.js.inherent.hours)
  })

  it('takes the furthest target among a topic’s subjects, with that subject’s roots', () => {
    expect(map.topics.react.target).toMatchObject({ level: 4, from: 'subject', subject: { id: 'web' }, roots: 2 })
    expect(map.topics.js.start).toEqual({ level: 2, from: 'roots', weight: 0 })
  })

  it('assumes a working knowledge for a topic in no subject', () => {
    expect(map.topics.loose.target).toMatchObject({ level: 3, from: 'assumed' })
  })

  it('reads a topic with varieties by its span', () => {
    expect(map.topics.react.span).toMatchObject({ varieties: 1 })
    expect(map.topics.react.span!.hours).toBeGreaterThan(map.topics.react.hours)
    expect(map.topics.js.span).toBeNull()
  })

  it('lets a topic’s own target override its subjects’', () => {
    const own = effortFrom({ ...base, topicTargets: new Map([['react', 5]]) })
    expect(own.topics.react.target).toMatchObject({ level: 5, from: 'topic', roots: 2 })
    expect(own.topics.react.hours).toBeGreaterThan(map.topics.react.hours)
  })

  it('adds a bed up from its own topics, each once', () => {
    const web = map.subjects.web
    const sum = ['js', 'react', 'hooks'].reduce((h, id) => h + map.topics[id].hours, 0)
    expect(web.hours).toBeCloseTo(sum)
    expect(web).toMatchObject({ topics: 3, target: 4 })
    expect(map.subjects.ui).toMatchObject({ topics: 1, target: 3 })
  })
})
