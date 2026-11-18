import { describe, expect, it } from 'vitest'
import type { GraphEvent } from './graph-client'
import { freeMinutesInWindows, summariseCalendarDay } from './outlook-calendar'

function event(
  id: string,
  start: string,
  end: string,
  fields: Partial<GraphEvent> = {}
): GraphEvent {
  return {
    id,
    subject: id,
    start: { dateTime: `2026-11-18T${start}:00.0000000`, timeZone: 'UTC' },
    end: { dateTime: `2026-11-18T${end}:00.0000000`, timeZone: 'UTC' },
    showAs: 'busy',
    ...fields
  }
}

const range = { start: '2026-11-18T00:00:00.000Z', end: '2026-11-19T00:00:00.000Z' }
const now = new Date('2026-11-18T08:00:00Z')

describe('summariseCalendarDay', () => {
  it('separates Orca windows from meetings and skips free, cancelled and Orca block events', () => {
    const day = summariseCalendarDay(
      [
        event('window', '09:00', '12:00', { categories: ['Orca'] }),
        event('standup', '09:30', '10:00'),
        event('lunch', '12:00', '13:00', { showAs: 'free' }),
        event('cancelled', '14:00', '15:00', { isCancelled: true }),
        event('block', '10:00', '11:00', { categories: ['Orca block'], showAs: 'free' }),
        event('holiday', '00:00', '23:59', { isAllDay: true, showAs: 'free' })
      ],
      { workingHours: { daysOfWeek: ['monday'], startTime: '09:00:00', endTime: '17:30:00' } },
      range,
      now
    )
    expect(day.orcaWindows.map((w) => w.subject)).toEqual(['window'])
    expect(day.busy.map((b) => b.subject)).toEqual(['standup'])
    expect(day.freeMinutesInWindows).toBe(150)
    expect(day.workingHours?.endTime).toBe('17:30:00')
  })
})

describe('freeMinutesInWindows', () => {
  it('does not double-count overlapping meetings', () => {
    const window = { start: '2026-11-18T09:00:00Z', end: '2026-11-18T11:00:00Z' }
    const busy = [
      { start: '2026-11-18T08:30:00Z', end: '2026-11-18T09:30:00Z' },
      { start: '2026-11-18T09:15:00Z', end: '2026-11-18T10:00:00Z' }
    ]
    expect(freeMinutesInWindows([window], busy)).toBe(60)
  })
})
