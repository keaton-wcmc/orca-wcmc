import { graphUtcToIso, type GraphEvent, type GraphMailboxSettings } from './graph-client'

export const ORCA_WINDOW_CATEGORY = 'Orca'
export const ORCA_BLOCK_CATEGORY = 'Orca block'
const BUSY_STATES = new Set(['busy', 'tentative', 'oof', 'workingElsewhere'])

export type CalendarInterval = { start: string; end: string; subject?: string }

export type CalendarDay = {
  start: string
  end: string
  busy: CalendarInterval[]
  orcaWindows: CalendarInterval[]
  workingHours?: { daysOfWeek: string[]; startTime: string; endTime: string; timeZone?: string }
  timeZone?: string
  freeMinutesInWindows: number
  fetchedAt: string
}

function interval(event: GraphEvent): CalendarInterval {
  return {
    start: graphUtcToIso(event.start),
    end: graphUtcToIso(event.end),
    ...(event.subject ? { subject: event.subject } : {})
  }
}

function overlapMs(a: CalendarInterval, b: CalendarInterval): number {
  const start = Math.max(Date.parse(a.start), Date.parse(b.start))
  const end = Math.min(Date.parse(a.end), Date.parse(b.end))
  return Math.max(0, end - start)
}

/** Free minutes inside Orca windows once meetings overlapping them are taken out. */
export function freeMinutesInWindows(
  windows: CalendarInterval[],
  busy: CalendarInterval[]
): number {
  let free = 0
  for (const window of windows) {
    const busyInside = mergeIntervals(
      busy
        .filter((entry) => overlapMs(entry, window) > 0)
        .map((entry) => ({
          start: new Date(
            Math.max(Date.parse(entry.start), Date.parse(window.start))
          ).toISOString(),
          end: new Date(Math.min(Date.parse(entry.end), Date.parse(window.end))).toISOString()
        }))
    )
    const windowMs = Date.parse(window.end) - Date.parse(window.start)
    const busyMs = busyInside.reduce(
      (sum, entry) => sum + Date.parse(entry.end) - Date.parse(entry.start),
      0
    )
    free += Math.max(0, windowMs - busyMs)
  }
  return Math.round(free / 60_000)
}

function mergeIntervals(intervals: CalendarInterval[]): CalendarInterval[] {
  const sorted = [...intervals].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const merged: CalendarInterval[] = []
  for (const entry of sorted) {
    const last = merged.at(-1)
    if (last && Date.parse(entry.start) <= Date.parse(last.end)) {
      if (Date.parse(entry.end) > Date.parse(last.end)) {
        last.end = entry.end
      }
    } else {
      merged.push({ start: entry.start, end: entry.end })
    }
  }
  return merged
}

/** Splits a day's events into meetings and the user's Orca focus windows. */
export function summariseCalendarDay(
  events: GraphEvent[],
  mailbox: GraphMailboxSettings,
  range: { start: string; end: string },
  now: Date
): CalendarDay {
  const live = events.filter((event) => !event.isCancelled)
  const orcaWindows = live
    .filter((event) => event.categories?.includes(ORCA_WINDOW_CATEGORY))
    .map(interval)
  const busy = live
    .filter(
      (event) =>
        !event.categories?.includes(ORCA_WINDOW_CATEGORY) &&
        !event.categories?.includes(ORCA_BLOCK_CATEGORY) &&
        BUSY_STATES.has(event.showAs ?? 'busy') &&
        !(event.isAllDay && event.showAs !== 'oof')
    )
    .map(interval)
  const hours = mailbox.workingHours
  return {
    start: range.start,
    end: range.end,
    busy,
    orcaWindows,
    ...(hours
      ? {
          workingHours: {
            daysOfWeek: hours.daysOfWeek,
            startTime: hours.startTime,
            endTime: hours.endTime,
            ...(hours.timeZone ? { timeZone: hours.timeZone.name } : {})
          }
        }
      : {}),
    ...(mailbox.timeZone ? { timeZone: mailbox.timeZone } : {}),
    freeMinutesInWindows: freeMinutesInWindows(orcaWindows, busy),
    fetchedAt: now.toISOString()
  }
}

/** Local midnight to midnight for the day containing `now`. */
export function localDayRange(now: Date): { start: string; end: string } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
