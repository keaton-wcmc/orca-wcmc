import { describe, expect, it } from 'vitest'
import { isReminderDue, orderWorkTasks } from './work-task-order'
import { workTaskSchema, type WorkTask } from './work-task-types'

const now = new Date('2026-11-16T12:00:00Z')

function task(id: string, fields: Partial<WorkTask> = {}): WorkTask {
  return {
    id,
    title: id,
    durationMin: 30,
    state: 'open',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...fields
  }
}

const worktreeLink = { kind: 'worktree' as const, worktreeId: 'wt-1', label: 'sapi-fix' }

describe('orderWorkTasks', () => {
  const noLinkedPriority = () => undefined

  it('puts an overdue low-priority follow-up before an urgent one that is not due', () => {
    const ordered = orderWorkTasks(
      [
        task('urgent', { priority: 'urgent' }),
        task('overdue-low', { priority: 'low', dueAt: '2026-11-15T00:00:00Z' })
      ],
      now,
      noLinkedPriority
    )
    expect(ordered.map((t) => t.id)).toEqual(['overdue-low', 'urgent'])
  })

  it("prefers the follow-up's own priority over its workspace's", () => {
    const ordered = orderWorkTasks(
      [
        task('own-low', { priority: 'low', link: worktreeLink }),
        task('high', { priority: 'high' })
      ],
      now,
      () => 'urgent'
    )
    expect(ordered.map((t) => t.id)).toEqual(['high', 'own-low'])
  })

  it("falls back to the linked workspace's priority", () => {
    const ordered = orderWorkTasks(
      [task('medium', { priority: 'medium' }), task('linked', { link: worktreeLink })],
      now,
      () => 'urgent'
    )
    expect(ordered.map((t) => t.id)).toEqual(['linked', 'medium'])
  })

  it('drops done follow-ups and breaks ties by age', () => {
    const ordered = orderWorkTasks(
      [
        task('newer', { createdAt: '2026-11-02T00:00:00Z' }),
        task('done', { state: 'done' }),
        task('older')
      ],
      now,
      noLinkedPriority
    )
    expect(ordered.map((t) => t.id)).toEqual(['older', 'newer'])
  })
})

describe('isReminderDue', () => {
  const remind = { at: now.toISOString(), whenIdle: false }

  it('is due at its time, and not once fired or done', () => {
    expect(isReminderDue(task('a', { remind }), now)).toBe(true)
    expect(isReminderDue(task('b', { remind: { ...remind, firedAt: remind.at } }), now)).toBe(false)
    expect(isReminderDue(task('c', { remind, state: 'done' }), now)).toBe(false)
  })
})

describe('workTaskSchema', () => {
  it('allows "only if nothing changed" only on PR and MR links', () => {
    const idle = { at: now.toISOString(), whenIdle: true }
    expect(workTaskSchema.safeParse(task('a', { link: worktreeLink, remind: idle })).success).toBe(
      false
    )
    const pr = { kind: 'pr' as const, host: 'github.com', repo: 'unepwcmc/sapi', number: 1 }
    expect(workTaskSchema.safeParse(task('b', { link: pr, remind: idle })).success).toBe(true)
  })
})
