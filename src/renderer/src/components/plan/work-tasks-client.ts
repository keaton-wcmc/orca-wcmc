import type { WorkTask, WorkTaskDraft } from '../../../../shared/work-tasks/work-task-types'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

// Follow-ups live on this desktop, so every call targets the local runtime.
const LOCAL = { kind: 'local' } as const

export type WorkTaskListResult = {
  tasks: WorkTask[]
  storeState: { ok: true } | { ok: false; error: 'unreadable' }
  storePath: string
}

export type SlackWebhookStatus = {
  configured: boolean
  encryptionAvailable: boolean
  lastError?: string
}

export const workTasksClient = {
  list: () => callRuntimeRpc<WorkTaskListResult>(LOCAL, 'workTask.list'),
  create: (draft: WorkTaskDraft) =>
    callRuntimeRpc<{ task: WorkTask }>(LOCAL, 'workTask.create', draft),
  snooze: (id: string, until: string) =>
    callRuntimeRpc<{ task: WorkTask }>(LOCAL, 'workTask.snooze', { id, until }),
  done: (id: string) => callRuntimeRpc<{ task: WorkTask }>(LOCAL, 'workTask.done', { id }),
  remove: (id: string) => callRuntimeRpc<Record<string, never>>(LOCAL, 'workTask.remove', { id }),
  slackStatus: () => callRuntimeRpc<SlackWebhookStatus>(LOCAL, 'workTask.slackWebhook.status'),
  setSlack: (url: string) =>
    callRuntimeRpc<SlackWebhookStatus>(LOCAL, 'workTask.slackWebhook.set', { url }),
  clearSlack: () => callRuntimeRpc<SlackWebhookStatus>(LOCAL, 'workTask.slackWebhook.clear'),
  testSlack: () =>
    callRuntimeRpc<{ ok: boolean; error?: string }>(LOCAL, 'workTask.slackWebhook.test')
}
