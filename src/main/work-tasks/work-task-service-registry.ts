import type { LinkedPriorityLookup } from '../../shared/work-tasks/work-task-order'
import type { FollowUpReminderService } from '../follow-up-reminders/follow-up-reminder-service'
import type { MicrosoftIntegration } from '../microsoft-graph/microsoft-integration'
import type { SlackWebhookSecret } from '../follow-up-reminders/slack-webhook-secret'
import type { WorkTaskStore } from './work-task-store'

export type WorkTaskServices = {
  store: WorkTaskStore
  reminders: FollowUpReminderService
  slackWebhook: SlackWebhookSecret
  microsoft: MicrosoftIntegration
  linkedPriority: LinkedPriorityLookup
  now: () => Date
}

// Module-level so the fork's follow-ups stay out of upstream's runtime composition.
let services: WorkTaskServices | null = null

export function setWorkTaskServices(next: WorkTaskServices | null): void {
  services = next
}

export function requireWorkTaskServices(): WorkTaskServices {
  if (!services) {
    throw new Error('Follow-ups live on the desktop app')
  }
  return services
}
