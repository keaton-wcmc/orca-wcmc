import { join } from 'node:path'
import { app, powerMonitor, shell } from 'electron'
import { getWorkspacePriority } from '../../shared/workspace-priority'
import type { LinkedPriorityLookup } from '../../shared/work-tasks/work-task-order'
import { FollowUpReminderService } from '../follow-up-reminders/follow-up-reminder-service'
import { postSlackWebhook } from '../follow-up-reminders/slack-webhook-delivery'
import { SlackWebhookSecret } from '../follow-up-reminders/slack-webhook-secret'
import type { Store } from '../persistence/loading-store/store'
import { GraphTokenStore } from '../microsoft-graph/graph-token-store'
import { MicrosoftGraphConfigFile } from '../microsoft-graph/microsoft-graph-config'
import { MicrosoftIntegration } from '../microsoft-graph/microsoft-integration'
import { WorkTaskStore } from '../work-tasks/work-task-store'
import { setWorkTaskServices } from '../work-tasks/work-task-service-registry'
import { mainProcessState as state } from './main-process-state'

/** Follow-ups live on the desktop app only; `orca serve` hosts skip them. */
export function initializeMainProcessWorkTasks(): void {
  const store = state.store
  const runtime = state.core.runtime
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
  const microsoft = new MicrosoftIntegration({
    config: new MicrosoftGraphConfigFile(join(userData, 'microsoft-graph.json')),
    tokens: new GraphTokenStore(join(userData, 'microsoft-graph-tokens.enc')),
    store: tasks,
    openBrowser: (url) => shell.openExternal(url),
    now
  })
  setWorkTaskServices({
    store: tasks,
    reminders,
    slackWebhook,
    microsoft,
    linkedPriority: linkedPriorityFromStore(store),
    now
  })
  reminders.start()
  microsoft.start()
  app.once('will-quit', () => {
    reminders.stop()
    microsoft.stop()
  })
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
