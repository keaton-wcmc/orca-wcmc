import { join } from 'node:path'
import { app, powerMonitor } from 'electron'
import { getWorkspacePriority } from '../../shared/workspace-priority'
import type { LinkedPriorityLookup } from '../../shared/work-tasks/work-task-order'
import { FollowUpReminderService } from '../follow-up-reminders/follow-up-reminder-service'
import { postSlackWebhook } from '../follow-up-reminders/slack-webhook-delivery'
import { SlackWebhookSecret } from '../follow-up-reminders/slack-webhook-secret'
import type { Store } from '../persistence/loading-store/store'
import { WorkTaskStore } from '../work-tasks/work-task-store'
import { setWorkTaskServices } from '../work-tasks/work-task-service-registry'
import { mainProcessState as state } from './main-process-state'

/** Follow-ups live on the desktop app only; `orca serve` hosts skip them. */
export function initializeMainProcessWorkTasks(): void {
  const store = state.store
  const runtime = state.runtime
  if (state.isServeMode || !store || !runtime) {
    return
  }
  const userData = app.getPath('userData')
  const now = () => new Date()
  const tasks = new WorkTaskStore(join(userData, 'work-tasks.json'), now)
  const slackWebhook = new SlackWebhookSecret(join(userData, 'follow-up-slack-webhook.enc'))
  const reminders = new FollowUpReminderService({
    store: tasks,
    now,
    delivery: {
      notify: (title, body) =>
        runtime.dispatchPluginNotification({ pluginId: 'Follow-up', title, body }),
      slack: async (text) => {
        const url = slackWebhook.read()
        return url ? postSlackWebhook(url, text) : null
      },
      recordSlackError: (message) => slackWebhook.recordError(message)
    },
    onResume: (listener) => {
      powerMonitor.on('resume', listener)
      return () => powerMonitor.off('resume', listener)
    }
  })
  setWorkTaskServices({
    store: tasks,
    reminders,
    slackWebhook,
    linkedPriority: linkedPriorityFromStore(store),
    now
  })
  reminders.start()
  app.once('will-quit', () => reminders.stop())
}

function linkedPriorityFromStore(store: Store): LinkedPriorityLookup {
  return (link) => {
    if (link.kind === 'worktree' || link.kind === 'agent') {
      return getWorkspacePriority(store.getWorktreeMeta(link.worktreeId) ?? {}) ?? undefined
    }
    if (link.kind === 'folder') {
      return getWorkspacePriority(store.getFolderWorkspace(link.workspaceId) ?? {}) ?? undefined
    }
    return undefined
  }
}
