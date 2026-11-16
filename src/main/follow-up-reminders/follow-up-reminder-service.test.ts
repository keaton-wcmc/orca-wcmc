import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { WorkTaskDraft } from '../../shared/work-tasks/work-task-types'
import { WorkTaskStore } from '../work-tasks/work-task-store'
import type { LinkActivity } from './link-activity-check'
import { FollowUpReminderService, type FollowUpDelivery } from './follow-up-reminder-service'

const pr = { kind: 'pr' as const, host: 'github.com', repo: 'unepwcmc/sapi', number: 42 }

describe('FollowUpReminderService', () => {
  let dir: string
  let clock: Date
  let store: WorkTaskStore
  let delivery: {
    notify: Mock<FollowUpDelivery['notify']>
    slack: Mock<FollowUpDelivery['slack']>
    recordSlackError: Mock<FollowUpDelivery['recordSlackError']>
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'follow-up-service-'))
    clock = new Date('2026-11-16T09:00:00Z')
    store = new WorkTaskStore(join(dir, 'work-tasks.json'), () => clock)
    delivery = {
      notify: vi.fn<FollowUpDelivery['notify']>(),
      slack: vi.fn<FollowUpDelivery['slack']>(async () => ({ ok: true })),
      recordSlackError: vi.fn<FollowUpDelivery['recordSlackError']>()
    }
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const service = (checkActivity?: (link: unknown) => Promise<LinkActivity>) =>
    new FollowUpReminderService({ store, delivery, now: () => clock, checkActivity })

  const remindAt = (at: string, draft: Partial<WorkTaskDraft> = {}) =>
    store.create({
      title: 'Chase review',
      durationMin: 15,
      remind: { at, whenIdle: false },
      ...draft
    })

  it('delivers a due reminder once and marks it fired', async () => {
    const task = remindAt('2026-11-16T09:00:00Z')
    const reminders = service()
    await reminders.tick()
    await reminders.tick()
    expect(delivery.notify).toHaveBeenCalledTimes(1)
    expect(delivery.notify).toHaveBeenCalledWith('Chase review', '')
    expect(delivery.slack).toHaveBeenCalledWith(':alarm_clock: Chase review')
    expect(store.get(task.id)?.remind?.firedAt).toBe('2026-11-16T09:00:00.000Z')
  })

  it('fires a reminder missed while asleep once, labelled overdue', async () => {
    remindAt('2026-11-16T03:00:00Z')
    const reminders = service()
    await reminders.tick()
    clock = new Date('2026-11-16T09:01:00Z')
    await reminders.tick()
    expect(delivery.notify).toHaveBeenCalledTimes(1)
    expect(delivery.notify.mock.calls[0][1]).toMatch(/^overdue since \d\d:\d\d$/)
  })

  it('never delivers twice when a slow activity check overlaps the next tick', async () => {
    let release: (activity: LinkActivity) => void = () => {}
    const stalled = new Promise<LinkActivity>((resolve) => {
      release = resolve
    })
    remindAt('2026-11-16T09:00:00Z', {
      link: pr,
      remind: { at: '2026-11-16T09:00:00Z', whenIdle: true }
    })
    const reminders = service(() => stalled)
    const first = reminders.tick()
    await reminders.tick()
    release('idle')
    await first
    await reminders.tick()
    expect(delivery.notify).toHaveBeenCalledTimes(1)
  })

  it('resolves quietly when the linked PR moved', async () => {
    const task = remindAt('2026-11-16T09:00:00Z', {
      link: pr,
      remind: { at: '2026-11-16T09:00:00Z', whenIdle: true }
    })
    await service(async () => 'moved').tick()
    expect(delivery.notify).not.toHaveBeenCalled()
    expect(store.get(task.id)).toMatchObject({
      state: 'done',
      resolution: { reason: 'link-moved' }
    })
  })

  it('still delivers when activity cannot be checked, and says so', async () => {
    remindAt('2026-11-16T09:00:00Z', {
      link: pr,
      remind: { at: '2026-11-16T09:00:00Z', whenIdle: true }
    })
    await service(async () => 'unknown').tick()
    expect(delivery.notify).toHaveBeenCalledWith(
      'Chase review',
      "unepwcmc/sapi#42 · couldn't check activity"
    )
  })

  it('uses the stored label for a worktree that no longer exists', async () => {
    remindAt('2026-11-16T09:00:00Z', {
      link: { kind: 'worktree', worktreeId: 'deleted-wt', label: 'sapi-fix' }
    })
    await service().tick()
    expect(delivery.notify).toHaveBeenCalledWith('Chase review', 'sapi-fix')
  })

  it('records a Slack failure and still notifies the desktop', async () => {
    delivery.slack.mockResolvedValueOnce({ ok: false, error: 'Slack webhook returned HTTP 500' })
    remindAt('2026-11-16T09:00:00Z')
    await service().tick()
    expect(delivery.notify).toHaveBeenCalledTimes(1)
    expect(delivery.recordSlackError).toHaveBeenCalledWith('Slack webhook returned HTTP 500')
  })
})
