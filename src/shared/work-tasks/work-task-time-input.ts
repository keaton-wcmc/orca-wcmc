const DEFAULT_HOUR = 9
const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
}
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const

export const WORK_TASK_TIME_INPUT_HINT = 'Try +2h, tomorrow, tomorrow 14:00, fri, or an ISO date.'

/** Parses follow-up time input in the local time zone; returns ISO UTC or null. */
export function parseWorkTaskTimeInput(input: string, now: Date): string | null {
  const text = input.trim().toLowerCase()
  if (!text) {
    return null
  }

  const relative = /^\+(\d+)([mhd])$/.exec(text)
  if (relative) {
    const amount = Number(relative[1])
    if (amount <= 0) {
      return null
    }
    // "+1d" is exactly 24 hours, so it never shifts with a DST change.
    const unitMs = relative[2] === 'm' ? UNIT_MS.m : relative[2] === 'h' ? UNIT_MS.h : UNIT_MS.d
    return new Date(now.getTime() + amount * unitMs).toISOString()
  }

  const named = /^(tomorrow|sun|mon|tue|wed|thu|fri|sat)(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text)
  if (named) {
    const hour = named[2] === undefined ? DEFAULT_HOUR : Number(named[2])
    const minute = named[3] === undefined ? 0 : Number(named[3])
    if (hour > 23 || minute > 59) {
      return null
    }
    const target = new Date(now)
    target.setDate(target.getDate() + daysAhead(named[1], now))
    target.setHours(hour, minute, 0, 0)
    return target.toISOString()
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const parsed = Date.parse(input.trim())
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
  }
  return null
}

function daysAhead(word: string, now: Date): number {
  if (word === 'tomorrow') {
    return 1
  }
  const delta = ((WEEKDAY_INDEX[word] ?? 0) - now.getDay() + 7) % 7
  return delta === 0 ? 7 : delta
}
