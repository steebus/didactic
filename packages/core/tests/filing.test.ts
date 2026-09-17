import { describe, it, expect } from 'vitest'
import { claimSentence, filingClaims } from '../src/filing'
import { config } from '../src/config'

/** A topic's neighbours, each named by the subjects it sits in. A loose
 *  neighbour is an empty array. */
const web = 'web', stocks = 'stocks'

describe('filingClaims', () => {
  it('files a topic three of whose neighbours agree', () => {
    // Price-to-Earnings Ratio, as it actually stood: five neighbours in
    // Shares and Stocks, two loose, and no membership anywhere.
    const [claim] = filingClaims([[stocks], [stocks], [stocks], [stocks], [stocks], [], []])

    expect(claim.subjectId).toBe(stocks)
    expect(claim.agreeing).toBe(5)
    expect(claim.share).toBe(1)
    expect(claim.standing).toBe('settled')
  })

  it('offers rather than files where only two agree', () => {
    // Data Science sat here, with two neighbours in Web Development and
    // no business being filed under it. Two edges is what a neighbouring
    // subject looks like from outside.
    const [claim] = filingClaims([[web], [web]])

    expect(claim.agreeing).toBe(2)
    expect(claim.standing).toBe('unclear')
  })

  it('does not count a loose neighbour against a claim', () => {
    // Half this bed's loose topics are joined to each other. Counting
    // them in the share would hold down exactly the clusters that most
    // need filing -- so the share is over the neighbours filed anywhere,
    // and three agreeing among eight neighbours still settles it.
    const [claim] = filingClaims([[stocks], [stocks], [stocks], [], [], [], [], []])

    expect(claim.share).toBe(1)
    expect(claim.standing).toBe('settled')
  })

  it('says nothing at all about a topic whose neighbours are all loose', () => {
    expect(filingClaims([[], [], []])).toEqual([])
    expect(filingClaims([])).toEqual([])
  })

  it('holds back a bridge topic that touches two subjects evenly', () => {
    // Inert on the bed this was measured against, where every loose
    // topic's neighbours sat in one subject. It is the case the share
    // test exists for: three each way is not a claim about either.
    const claims = filingClaims([[web], [web], [web], [stocks], [stocks], [stocks]])

    expect(claims).toHaveLength(2)
    expect(claims.every(c => c.agreeing === 3)).toBe(true)
    expect(claims.every(c => c.share === 0.5)).toBe(true)
    expect(claims.every(c => c.standing === 'unclear')).toBe(true)
  })

  it('files under both subjects where a topic genuinely sits in two', () => {
    // Membership is many-to-many; a topic in two beds should land in
    // both rather than in whichever had one more edge.
    const claims = filingClaims([
      [web, stocks], [web, stocks], [web, stocks], [web, stocks],
    ])

    expect(claims).toHaveLength(2)
    expect(claims.every(c => c.standing === 'settled')).toBe(true)
  })

  it('counts a neighbour once per subject, however it is listed', () => {
    // One neighbour must not clear a bar meant to need three by being
    // handed over with the same subject twice.
    const [claim] = filingClaims([[web, web, web]])

    expect(claim.agreeing).toBe(1)
    expect(claim.standing).toBe('unclear')
  })

  it('ranks the strongest claim first', () => {
    const claims = filingClaims([[web], [web], [web], [web], [stocks]])

    expect(claims.map(c => c.subjectId)).toEqual([web, stocks])
  })

  it('sits on the bar named in config rather than on a 3 written here', () => {
    const atBar = Array.from({ length: config.FILING_SETTLED }, () => [web])
    const under = atBar.slice(1)

    expect(filingClaims(atBar)[0].standing).toBe('settled')
    expect(filingClaims(under)[0].standing).toBe('unclear')
  })
})

describe('claimSentence', () => {
  it('counts one neighbour as one', () => {
    // "Every one of its 1 filed neighbours sits in Web Development" is
    // what a sentence built from counts says the first time it meets a
    // one, and it was on every row of the sheet.
    expect(claimSentence({ agreeing: 1 }, 1)).toBe('Its only filed neighbour sits in')
  })

  it('says every one where they all agree', () => {
    expect(claimSentence({ agreeing: 5 }, 5)).toBe('Every one of its 5 filed neighbours sits in')
  })

  it('prints both counts where they differ, and agrees the verb', () => {
    expect(claimSentence({ agreeing: 2 }, 3)).toBe('2 of its 3 filed neighbours sit in')
    expect(claimSentence({ agreeing: 1 }, 3)).toBe('One of its 3 filed neighbours sits in')
  })
})
