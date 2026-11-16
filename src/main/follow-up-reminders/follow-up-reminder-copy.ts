import type { WorkTask, WorkTaskLink } from '../../shared/work-tasks/work-task-types'

const OVERDUE_AFTER_MS = 2 * 60_000

export function describeWorkTaskLink(link: WorkTaskLink): string {
  switch (link.kind) {
    case 'worktree':
    case 'folder':
    case 'agent':
      return link.label
    case 'pr':
      return `${link.repo}#${link.number}`
    case 'mr':
      return `${link.project}!${link.iid}`
    case 'slack':
      return 'Slack thread'
  }
}

export function followUpNotificationText(
  task: WorkTask,
  now: Date,
  options: { activityUnchecked?: boolean } = {}
): { title: string; body: string; slack: string } {
  const parts: string[] = []
  if (task.link) {
    parts.push(describeWorkTaskLink(task.link))
  }
  const at = task.remind ? new Date(task.remind.at) : null
  if (at && now.getTime() - at.getTime() > OVERDUE_AFTER_MS) {
    parts.push(`overdue since ${formatLocalTime(at)}`)
  }
  if (options.activityUnchecked) {
    parts.push("couldn't check activity")
  }
  const body = parts.join(' · ')
  return {
    title: task.title,
    body,
    slack: body ? `:alarm_clock: ${task.title} — ${body}` : `:alarm_clock: ${task.title}`
  }
}

function formatLocalTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}
