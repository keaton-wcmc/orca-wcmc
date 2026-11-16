import { describe, expect, it } from 'vitest'
import { WORK_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/work-tasks/work-tasks-runtime-capability'
import type { WorkTask } from '../../../src/shared/work-tasks/work-task-types'
import { hostSupportsFollowUps, selectFollowUpRows } from './follow-up-operations'

function task(id: string, fields: Partial<WorkTask> = {}): WorkTask {
  return {
    id,
    title: id,
    durationMin: 30,
    state: 'open',
    createdAt: '2026-11-16T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    ...fields
  }
}

describe('selectFollowUpRows', () => {
  it('puts due follow-ups first and leaves out ones without a reminder', () => {
    const upcoming = task('upcoming', { remind: { at: '2026-11-18T09:00:00Z', whenIdle: false } })
    const due = task('due', {
      remind: { at: '2026-11-16T09:00:00Z', whenIdle: false, firedAt: '2026-11-16T09:00:00Z' }
    })
    expect(selectFollowUpRows([upcoming, task('no-reminder'), due]).map((t) => t.id)).toEqual([
      'due',
      'upcoming'
    ])
  })
})

describe('hostSupportsFollowUps', () => {
  it('needs the work-tasks capability', () => {
    expect(hostSupportsFollowUps([WORK_TASKS_RUNTIME_CAPABILITY])).toBe(true)
    expect(hostSupportsFollowUps(['other.v1'])).toBe(false)
    expect(hostSupportsFollowUps(undefined)).toBe(false)
  })
})
