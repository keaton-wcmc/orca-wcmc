import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseWorkTaskTimeInput } from './work-task-time-input'

describe('parseWorkTaskTimeInput', () => {
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'Europe/London'
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  // UK clocks go back at 02:00 BST on 2026-10-25.
  const eveBeforeDstEnds = new Date('2026-10-24T20:00:00Z')

  it('puts "tomorrow" at 09:00 local across the DST change', () => {
    expect(parseWorkTaskTimeInput('tomorrow', eveBeforeDstEnds)).toBe('2026-10-25T09:00:00.000Z')
  })

  it('treats "+1d" as exactly 24 hours', () => {
    expect(parseWorkTaskTimeInput('+1d', eveBeforeDstEnds)).toBe('2026-10-25T20:00:00.000Z')
  })

  it('accepts a time after "tomorrow"', () => {
    expect(parseWorkTaskTimeInput('tomorrow 14:30', eveBeforeDstEnds)).toBe(
      '2026-10-25T14:30:00.000Z'
    )
  })

  it('moves a weekday to its next occurrence, a week out when it is today', () => {
    // 2026-10-24 is a Saturday.
    expect(parseWorkTaskTimeInput('fri', eveBeforeDstEnds)).toBe('2026-10-30T09:00:00.000Z')
    expect(parseWorkTaskTimeInput('sat', eveBeforeDstEnds)).toBe('2026-10-31T09:00:00.000Z')
  })

  it('adds minutes and hours', () => {
    expect(parseWorkTaskTimeInput('+90m', eveBeforeDstEnds)).toBe('2026-10-24T21:30:00.000Z')
    expect(parseWorkTaskTimeInput('+2h', eveBeforeDstEnds)).toBe('2026-10-24T22:00:00.000Z')
  })

  it('accepts ISO dates', () => {
    expect(parseWorkTaskTimeInput('2026-11-20T10:00:00Z', eveBeforeDstEnds)).toBe(
      '2026-11-20T10:00:00.000Z'
    )
  })

  it.each(['garbage', '+0d', '+-1h', 'tomorrow 25:00', ''])('rejects %j', (input) => {
    expect(parseWorkTaskTimeInput(input, eveBeforeDstEnds)).toBeNull()
  })
})
