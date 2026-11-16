import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import { WORK_TASKS_RUNTIME_CAPABILITY } from '../../../../shared/work-tasks/work-tasks-runtime-capability'
import type { WorkTask } from '../../../../shared/work-tasks/work-task-types'
import { FollowUpReminderService } from '../../../follow-up-reminders/follow-up-reminder-service'
import { SlackWebhookSecret } from '../../../follow-up-reminders/slack-webhook-secret'
import { setWorkTaskServices } from '../../../work-tasks/work-task-service-registry'
import { WorkTaskStore } from '../../../work-tasks/work-task-store'
import type { RpcContext } from '../core'
import { WORK_TASK_METHODS } from './work-tasks'

vi.mock('electron', () => ({ safeStorage: {} }))

// SAFETY: work-task handlers never read the RPC context.
const context = {} as RpcContext

async function call(name: string, params?: unknown): Promise<unknown> {
  const method = WORK_TASK_METHODS.find((entry) => entry.name === name)
  if (!method) {
    throw new Error(`unknown method ${name}`)
  }
  const parsed = method.params ? method.params.parse(params) : undefined
  // SAFETY: each schema's parse output is exactly that method's handler input.
  return (method.handler as (p: unknown, c: RpcContext) => unknown)(parsed, context)
}

describe('work task RPC methods', () => {
  let dir: string
  const now = () => new Date('2026-11-16T09:00:00Z')

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'work-task-rpc-'))
    const store = new WorkTaskStore(join(dir, 'work-tasks.json'), now)
    const slackWebhook = new SlackWebhookSecret(join(dir, 'webhook.enc'), {
      isEncryptionAvailable: () => true,
      encryptString: (text) => Buffer.from(text),
      decryptString: (cipher) => cipher.toString()
    })
    const reminders = new FollowUpReminderService({
      store,
      now,
      delivery: { notify: () => {}, slack: async () => null, recordSlackError: () => {} }
    })
    setWorkTaskServices({ store, reminders, slackWebhook, linkedPriority: () => undefined, now })
  })
  afterEach(() => {
    setWorkTaskServices(null)
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists follow-ups most urgent first', async () => {
    await call('workTask.create', { title: 'low', durationMin: 30, priority: 'low' })
    await call('workTask.create', { title: 'urgent', durationMin: 30, priority: 'urgent' })
    const { tasks } = (await call('workTask.list')) as { tasks: WorkTask[] }
    expect(tasks.map((task) => task.title)).toEqual(['urgent', 'low'])
  })

  it('snoozing re-arms a fired reminder', async () => {
    const { task } = (await call('workTask.create', {
      title: 'chase',
      durationMin: 15,
      remind: { at: '2026-11-16T08:00:00Z', whenIdle: false, firedAt: '2026-11-16T08:00:00Z' }
    })) as { task: WorkTask }
    const snoozed = (await call('workTask.snooze', {
      id: task.id,
      until: '2026-11-17T09:00:00Z'
    })) as { task: WorkTask }
    expect(snoozed.task.state).toBe('snoozed')
    expect(snoozed.task.remind).toEqual({ at: '2026-11-17T09:00:00.000Z', whenIdle: false })
  })

  it('rejects a webhook URL that is not Slack', async () => {
    await expect(
      call('workTask.slackWebhook.set', { url: 'https://example.com/hook' })
    ).rejects.toThrow(/hooks\.slack\.com/)
  })

  it('says where follow-ups live when the desktop services are absent', async () => {
    setWorkTaskServices(null)
    await expect(call('workTask.list')).rejects.toThrow('Follow-ups live on the desktop app')
  })

  it('advertises the capability', () => {
    expect(RUNTIME_CAPABILITIES).toContain(WORK_TASKS_RUNTIME_CAPABILITY)
  })
})
