import { compareWorkspacePriority, type WorkspacePriority } from '../workspace-priority'
import type { WorkTask, WorkTaskLink } from './work-task-types'

export type LinkedPriorityLookup = (link: WorkTaskLink) => WorkspacePriority | undefined

/** Open follow-ups in the order they should be worked: overdue, priority, due date, age. */
export function orderWorkTasks(
  tasks: readonly WorkTask[],
  now: Date,
  linkedPriority: LinkedPriorityLookup
): WorkTask[] {
  const nowMs = now.getTime()
  const ranked = tasks
    .filter((task) => task.state !== 'done')
    .map((task) => ({
      task,
      overdue: task.dueAt !== undefined && Date.parse(task.dueAt) < nowMs,
      priority: task.priority ?? (task.link ? linkedPriority(task.link) : undefined),
      dueMs: task.dueAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(task.dueAt),
      createdMs: Date.parse(task.createdAt)
    }))
  ranked.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      compareWorkspacePriority(a, b) ||
      a.dueMs - b.dueMs ||
      a.createdMs - b.createdMs
  )
  return ranked.map((entry) => entry.task)
}

export function isReminderDue(task: WorkTask, now: Date): boolean {
  return (
    task.remind !== undefined &&
    task.remind.firedAt === undefined &&
    task.state !== 'done' &&
    Date.parse(task.remind.at) <= now.getTime()
  )
}

/** Fired and still waiting on the user. */
export function isFollowUpAwaitingUser(task: WorkTask): boolean {
  return task.state === 'open' && task.remind?.firedAt !== undefined
}
