import { describe, it, expect } from 'vitest'
import { readFormula, FUNCTION_NAMES } from '../src/expression'

/** Read and evaluate in one go, for the many cases that need both. */
const value = (source: string, scope: Record<string, number> = {}) =>
  readFormula(source)?.evaluate(scope) ?? null

describe('arithmetic', () => {
  it('reads a number', () => {
    expect(value('42')).toBe(42)
    expect(value('1.5')).toBe(1.5)
    expect(value('2e3')).toBe(2000)
    expect(value('1.5e-2')).toBe(0.015)
  })

  it('adds, subtracts, multiplies and divides', () => {
    expect(value('2 + 3')).toBe(5)
    expect(value('7 - 2')).toBe(5)
    expect(value('3 * 4')).toBe(12)
    expect(value('9 / 3')).toBe(3)
    expect(value('7 % 3')).toBe(1)
  })

  it('gives multiplication precedence over addition', () => {
    expect(value('2 + 3 * 4')).toBe(14)
    expect(value('(2 + 3) * 4')).toBe(20)
  })

  it('leans right on powers, as they are written on paper', () => {
    expect(value('2 ^ 3 ^ 2')).toBe(512)
    expect(value('(2 ^ 3) ^ 2')).toBe(64)
  })

  it('leans left on everything else', () => {
    expect(value('10 - 3 - 2')).toBe(5)
    expect(value('16 / 4 / 2')).toBe(2)
  })

  it('takes a unary minus tighter than times, looser than power', () => {
    expect(value('-2 ^ 2')).toBe(-4)
    expect(value('-2 * 3')).toBe(-6)
    expect(value('3 - -2')).toBe(5)
  })

  it('takes a pointless leading plus rather than calling it an error', () => {
    expect(value('+3 * 2')).toBe(6)
  })

  it('ignores whitespace, including none at all', () => {
    expect(value('2+3*4')).toBe(14)
    expect(value('  2  +  3  ')).toBe(5)
  })
})

describe('names', () => {
  it('reads what the scope supplies', () => {
    expect(value('principal * rate', { principal: 200, rate: 0.05 })).toBe(10)
  })

  it('says which names it needs', () => {
    const f = readFormula('principal * rate / 12')
    expect(f?.reads.sort()).toEqual(['principal', 'rate'])
  })

  it('names each one once however often it is read', () => {
    expect(readFormula('r + r * r')?.reads).toEqual(['r'])
  })

  it('has no names to read in a formula that is only numbers', () => {
    expect(readFormula('2 + 2')?.reads).toEqual([])
  })

  it('is nothing where a name is not supplied', () => {
    expect(value('principal * rate', { principal: 200 })).toBeNull()
  })

  it('is nothing where a name is supplied as something that is not a number', () => {
    // The scope is built from sliders, but a payload can still name
    // something that was never declared.
    expect(value('x + 1', { x: NaN })).toBeNull()
    expect(value('x + 1', { x: Infinity })).toBeNull()
  })
})

describe('functions', () => {
  it('calls the ones it knows', () => {
    expect(value('min(3, 5)')).toBe(3)
    expect(value('max(3, 5)')).toBe(5)
    expect(value('abs(0 - 4)')).toBe(4)
    expect(value('sqrt(16)')).toBe(4)
    expect(value('pow(2, 10)')).toBe(1024)
    expect(value('floor(1.8)')).toBe(1)
    expect(value('ceil(1.2)')).toBe(2)
    expect(value('round(1.5)')).toBe(2)
  })

  it('nests them and reads names inside them', () => {
    expect(value('max(0, principal - paid)', { principal: 100, paid: 130 })).toBe(0)
  })

  it('refuses a function it does not know', () => {
    expect(readFormula('fetch(1)')).toBeNull()
    expect(readFormula('alert(1)')).toBeNull()
    expect(readFormula('require(1)')).toBeNull()
  })

  it('refuses the right function with the wrong number of arguments', () => {
    expect(readFormula('min(3)')).toBeNull()
    expect(readFormula('sqrt(1, 2)')).toBeNull()
    expect(readFormula('abs()')).toBeNull()
  })

  it('has a name for every function it offers', () => {
    for (const name of FUNCTION_NAMES) {
      expect(typeof name).toBe('string')
    }
    expect(FUNCTION_NAMES).toContain('max')
  })
})

describe('what it refuses', () => {
  it('refuses anything that is not a string', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      expect(readFormula(bad)).toBeNull()
    }
  })

  it('refuses an empty formula', () => {
    expect(readFormula('')).toBeNull()
    expect(readFormula('   ')).toBeNull()
  })

  it('refuses a formula longer than any honest one', () => {
    expect(readFormula('1+'.repeat(400) + '1')).toBeNull()
  })

  it('refuses unbalanced brackets', () => {
    expect(readFormula('(2 + 3')).toBeNull()
    expect(readFormula('2 + 3)')).toBeNull()
    expect(readFormula('max(1, 2')).toBeNull()
  })

  it('refuses an operator with nothing to work on', () => {
    expect(readFormula('2 +')).toBeNull()
    expect(readFormula('* 2')).toBeNull()
    expect(readFormula('2 * * 3')).toBeNull()
  })

  it('refuses trailing rubbish rather than reading the part it likes', () => {
    expect(readFormula('2 + 3 4')).toBeNull()
    expect(readFormula('2 + 3 rate')).toBeNull()
  })
})

/**
 * The point of the whole module. A formula comes from a language model
 * writing a lesson, and a lesson body is downstream of ingested web
 * pages -- so the formula is not only the model's own idea. None of
 * these may ever evaluate to anything.
 */
describe('it cannot reach anything', () => {
  it('refuses property access', () => {
    expect(readFormula('a.b')).toBeNull()
    expect(readFormula('this.constructor')).toBeNull()
    expect(readFormula('x["y"]')).toBeNull()
  })

  it('refuses a bare name that exists on Object.prototype', () => {
    // Without an own-property check this would find the function on the
    // prototype chain, and the closed grammar would be worth nothing.
    expect(value('constructor')).toBeNull()
    expect(value('toString')).toBeNull()
    expect(value('__proto__')).toBeNull()
    expect(value('hasOwnProperty')).toBeNull()
  })

  it('refuses calling anything but a known function', () => {
    expect(readFormula('constructor("return 1")')).toBeNull()
    expect(readFormula('eval("1")')).toBeNull()
  })

  it('treats a dangerous-looking name as an ordinary name, and finds nothing', () => {
    // `globalThis` is a perfectly good identifier and parses as one.
    // What makes it harmless is that a name is inert: it resolves
    // against the scope the block declared and against nothing else,
    // so the worst it can be is a name nobody supplied.
    expect(readFormula('globalThis')?.reads).toEqual(['globalThis'])
    expect(value('globalThis')).toBeNull()
    expect(value('process')).toBeNull()
    expect(value('window')).toBeNull()
    // And it stays a plain number even if something supplies it.
    expect(value('globalThis + 1', { globalThis: 41 })).toBe(42)
  })

  it('refuses strings, so there is nothing to smuggle', () => {
    expect(readFormula('"a"')).toBeNull()
    expect(readFormula("'a'")).toBeNull()
    expect(readFormula('`a`')).toBeNull()
  })

  it('refuses assignment and sequencing', () => {
    expect(readFormula('x = 1')).toBeNull()
    expect(readFormula('1; 2')).toBeNull()
    expect(readFormula('x => 1')).toBeNull()
  })

  it('refuses every stray character outright', () => {
    for (const bad of ['2 & 3', '2 | 3', '2 < 3', '2 ! 3', '2 @ 3', '2 \\ 3', '2 { 3']) {
      expect(readFormula(bad)).toBeNull()
    }
  })
})

describe('answers nothing rather than a number nobody can draw', () => {
  it('is nothing on a division by zero', () => {
    expect(value('1 / 0')).toBeNull()
    expect(value('1 / (rate - rate)', { rate: 5 })).toBeNull()
    expect(value('1 % 0')).toBeNull()
  })

  it('is nothing where the arithmetic runs off the end of the numbers', () => {
    expect(value('10 ^ 400')).toBeNull()
  })

  it('is nothing where a function is given something it cannot answer', () => {
    expect(value('sqrt(0 - 1)')).toBeNull()
    expect(value('ln(0)')).toBeNull()
  })

  it('still answers where the arithmetic is merely unpleasant', () => {
    expect(value('0.1 + 0.2')).toBeCloseTo(0.3)
  })
})

describe('a real model', () => {
  // The monthly payment on a repayment mortgage, which is the formula
  // the block's own example is built on.
  const payment = 'principal * r / (1 - (1 + r) ^ (0 - n))'

  it('computes a monthly payment', () => {
    const f = readFormula(payment)
    // £250,000 over 25 years at 5.5%.
    const monthly = f?.evaluate({ principal: 250000, r: 0.055 / 12, n: 300 })
    expect(monthly).toBeCloseTo(1535.1, 0)
  })

  it('holds up at the edge of its own sliders', () => {
    const f = readFormula(payment)
    expect(f?.evaluate({ principal: 50000, r: 0.005 / 12, n: 60 })).toBeGreaterThan(0)
    expect(f?.evaluate({ principal: 1000000, r: 0.12 / 12, n: 480 })).toBeGreaterThan(0)
  })

  it('is nothing at a rate of zero, rather than a wrong number', () => {
    // The formula divides by r, so a zero rate has no answer in it.
    // Saying so beats plotting an infinity.
    const f = readFormula(payment)
    expect(f?.evaluate({ principal: 250000, r: 0, n: 300 })).toBeNull()
  })
})
