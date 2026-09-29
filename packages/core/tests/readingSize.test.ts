import { describe, expect, it } from 'vitest'
import {
  READING_SIZES,
  canStepReadingSize,
  readingSize,
  stepReadingSize,
} from '../src/readingSize'

describe('readingSize', () => {
  it('is as set when nothing readable is kept', () => {
    expect(readingSize(null)).toBe(1)
    expect(readingSize(undefined)).toBe(1)
    expect(readingSize('')).toBe(1)
    expect(readingSize('large')).toBe(1)
    expect(readingSize(NaN)).toBe(1)
  })

  it('reads a kept figure back as its step', () => {
    expect(readingSize('1.2')).toBe(1.2)
    expect(readingSize(0.85)).toBe(0.85)
  })

  it('snaps a figure between steps, or past the ends, to the nearest', () => {
    expect(readingSize('1.14')).toBe(1.1)
    expect(readingSize(9)).toBe(1.4)
    expect(readingSize('0.1')).toBe(0.85)
  })
})

describe('stepReadingSize', () => {
  it('steps one size either way', () => {
    expect(stepReadingSize(1, 1)).toBe(1.1)
    expect(stepReadingSize(1, -1)).toBe(0.925)
  })

  it('comes back to where it started', () => {
    expect(stepReadingSize(stepReadingSize(1, 1), -1)).toBe(1)
  })

  it('holds at the ends', () => {
    const largest = READING_SIZES[READING_SIZES.length - 1]
    expect(stepReadingSize(largest, 1)).toBe(largest)
    expect(stepReadingSize(READING_SIZES[0], -1)).toBe(READING_SIZES[0])
    expect(canStepReadingSize(largest, 1)).toBe(false)
    expect(canStepReadingSize(largest, -1)).toBe(true)
    expect(canStepReadingSize(READING_SIZES[0], -1)).toBe(false)
  })
})
