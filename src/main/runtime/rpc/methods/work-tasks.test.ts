import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import { WORK_TASKS_RUNTIME_CAPABILITY } from '../../../../shared/work-tasks/work-tasks-runtime-capability'
import { FollowUpReminderService } from '../../../follow-up-reminders/follow-up-reminder-service'
import { SlackWebhookSecret } from '../../../follow-up-reminders/slack-webhook-secret'
import { setWorkTaskServices } from '../../../work-tasks/work-task-service-registry'
import { WorkTaskStore } from '../../../work-tasks/work-task-store'
import { GraphTokenStore } from '../../../microsoft-graph/graph-token-store'
import { MicrosoftGraphConfigFile } from '../../../microsoft-graph/microsoft-graph-config'
import { MicrosoftIntegration } from '../../../microsoft-graph/microsoft-integration'
import { WORK_TASK_MICROSOFT_METHODS } from './work-task-microsoft-methods'
import type { RpcContext } from '../core'
import { WORK_TASK_METHODS } from './work-tasks'

vi.mock('electron', () => ({ safeStorage: {} }))

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: work-task handlers never read the RPC context.
const context = {} as RpcContext

async function call(name: string, params?: unknown): Promise<unknown> {
  const method = [...WORK_TASK_METHODS, ...WORK_TASK_MICROSOFT_METHODS].find(
    (entry) => entry.name === name
  )
  if (!method) {
    throw new Error(`unknown method ${name}`)
  }
  const parsed = method.params ? method.params.parse(params) : undefined
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: each schema's parse output is exactly that method's handler input.
  return (method.handler as (p: unknown, c: RpcContext) => unknown)(parsed, context)
}

describe('work task RPC methods', () => {
  let dir: string
  let store: WorkTaskStore
  const now = () => new Date('2026-11-16T09:00:00Z')

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'work-task-rpc-'))
    store = new WorkTaskStore(join(dir, 'work-tasks.json'), now)
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
    const microsoft = new MicrosoftIntegration({
      config: new MicrosoftGraphConfigFile(join(dir, 'microsoft-graph.json')),
      tokens: new GraphTokenStore(join(dir, 'tokens.enc'), {
        cipher: {
          isEncryptionAvailable: () => true,
          encryptString: Buffer.from,
          decryptString: String
        }
      }),
      store,
      openBrowser: () => {},
      now
    })
    setWorkTaskServices({
      store,
      reminders,
      slackWebhook,
      microsoft,
      linkedPriority: () => undefined,
      now
    })
  })
  afterEach(() => {
    setWorkTaskServices(null)
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists follow-ups most urgent first', async () => {
    await call('workTask.create', { title: 'low', durationMin: 30, priority: 'low' })
    await call('workTask.create', { title: 'urgent', durationMin: 30, priority: 'urgent' })
    expect(await call('workTask.list')).toMatchObject({
      tasks: [{ title: 'urgent' }, { title: 'low' }]
    })
  })

  it('snoozing re-arms a fired reminder', async () => {
    const task = store.create({
      title: 'chase',
      durationMin: 15,
      remind: { at: '2026-11-16T08:00:00Z', whenIdle: false, firedAt: '2026-11-16T08:00:00Z' }
    })
    await call('workTask.snooze', { id: task.id, until: '2026-11-17T09:00:00Z' })
    expect(store.get(task.id)?.state).toBe('snoozed')
    expect(store.get(task.id)?.remind).toEqual({ at: '2026-11-17T09:00:00.000Z', whenIdle: false })
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

  it('stores Microsoft ids, rejects non-GUIDs and reports disconnected until sign-in', async () => {
    await expect(
      call('workTask.microsoft.configure', { clientId: 'nope', tenantId: 'nope' })
    ).rejects.toThrow('Expected a GUID')
    expect(
      await call('workTask.microsoft.configure', {
        clientId: 'aeac42ee-9104-4dd6-9efc-a024538adf97',
        tenantId: '2faab858-d1f4-48af-86f6-486196d5969d'
      })
    ).toMatchObject({ configured: true, state: 'disconnected' })
    expect(await call('workTask.calendar.today', {})).toEqual({ day: null })
  })

  it('advertises the capability', () => {
    expect(RUNTIME_CAPABILITIES).toContain(WORK_TASKS_RUNTIME_CAPABILITY)
  })
})
