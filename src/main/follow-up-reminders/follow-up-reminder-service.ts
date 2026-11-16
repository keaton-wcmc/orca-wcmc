import { isReminderDue } from '../../shared/work-tasks/work-task-order'
import type { WorkTask } from '../../shared/work-tasks/work-task-types'
import type { WorkTaskStore } from '../work-tasks/work-task-store'
import { checkLinkActivity } from './link-activity-check'
import { followUpNotificationText } from './follow-up-reminder-copy'
import type { SlackWebhookResult } from './slack-webhook-delivery'

const DEFAULT_TICK_MS = 60_000

export type FollowUpDelivery = {
  notify: (title: string, body: string) => unknown
  /** Null when no webhook is configured. */
  slack: (text: string) => Promise<SlackWebhookResult | null>
  recordSlackError: (message: string | null) => void
}

export type FollowUpReminderDeps = {
  store: WorkTaskStore
  delivery: FollowUpDelivery
  now?: () => Date
  checkActivity?: typeof checkLinkActivity
  tickMs?: number
  /** Subscribes to system wake; returns an unsubscribe. */
  onResume?: (listener: () => void) => () => void
}

export class FollowUpReminderService {
  private readonly deps: Required<Omit<FollowUpReminderDeps, 'onResume'>> &
    Pick<FollowUpReminderDeps, 'onResume'>
  private timer: ReturnType<typeof setInterval> | null = null
  private unsubscribeResume: (() => void) | null = null
  private ticking = false

  constructor(deps: FollowUpReminderDeps) {
    this.deps = {
      now: () => new Date(),
      checkActivity: checkLinkActivity,
      tickMs: DEFAULT_TICK_MS,
      ...deps
    }
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => void this.tick(), this.deps.tickMs)
    this.unsubscribeResume = this.deps.onResume?.(() => void this.tick()) ?? null
    void this.tick()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.unsubscribeResume?.()
    this.unsubscribeResume = null
  }

  async tick(): Promise<void> {
    if (this.ticking || !this.deps.store.readState().ok) {
      return
    }
    this.ticking = true
    try {
      const now = this.deps.now()
      for (const task of this.deps.store.list().filter((entry) => isReminderDue(entry, now))) {
        await this.fire(task, now)
      }
    } finally {
      this.ticking = false
    }
  }

  private async fire(task: WorkTask, now: Date): Promise<void> {
    const { store, delivery } = this.deps
    const remind = task.remind
    if (!remind) {
      return
    }
    // Claim before any await so an overlapping wake tick cannot deliver it twice.
    store.update(task.id, { state: 'open', remind: { ...remind, firedAt: now.toISOString() } })

    let activityUnchecked = false
    if (remind.whenIdle && task.link) {
      const activity = await this.deps.checkActivity(task.link, task.createdAt)
      if (activity === 'moved') {
        store.update(task.id, {
          state: 'done',
          resolution: { at: now.toISOString(), reason: 'link-moved' }
        })
        return
      }
      activityUnchecked = activity === 'unknown'
    }

    const text = followUpNotificationText(task, now, { activityUnchecked })
    try {
      await delivery.notify(text.title, text.body)
    } catch (error) {
      console.warn('[follow-ups] desktop notification failed:', error)
    }
    const slack = await delivery.slack(text.slack)
    if (slack) {
      delivery.recordSlackError(slack.ok ? null : (slack.error ?? 'Slack webhook failed'))
    }
  }
}
