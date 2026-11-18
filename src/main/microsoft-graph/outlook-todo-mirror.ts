import type { WorkTask } from '../../shared/work-tasks/work-task-types'
import type { WorkTaskStore } from '../work-tasks/work-task-store'
import { graphUtcToIso, type GraphClient, type GraphTodoTask } from './graph-client'

export const ORCA_TODO_LIST_NAME = 'Orca'
const MARKER_PREFIX = 'orca-follow-up:'

export type TodoMirrorClient = Pick<
  GraphClient,
  | 'todoLists'
  | 'createTodoList'
  | 'listTodoTasks'
  | 'createTodoTask'
  | 'updateTodoTask'
  | 'deleteTodoTask'
>

export type TodoMirrorResult = {
  created: number
  moved: number
  completedRemote: number
  completedLocal: number
  deleted: number
}

function markerFor(taskId: string): string {
  return `${MARKER_PREFIX}${taskId}`
}

function markedTaskId(item: GraphTodoTask): string | null {
  const content = item.body?.content ?? ''
  const at = content.indexOf(MARKER_PREFIX)
  return at === -1 ? null : content.slice(at + MARKER_PREFIX.length).split(/\s/)[0] || null
}

/** Fixed-time reminders only; an idle-only reminder may never fire, so Outlook must not ring for it. */
function isMirrorable(task: WorkTask): boolean {
  return task.state !== 'done' && task.remind !== undefined && !task.remind.whenIdle
}

function todoReminder(at: string): Record<string, unknown> {
  return {
    isReminderOn: true,
    reminderDateTime: { dateTime: at.replace(/Z$/, ''), timeZone: 'UTC' }
  }
}

export async function ensureOrcaTodoList(client: TodoMirrorClient): Promise<string> {
  const lists = await client.todoLists()
  return (
    lists.find((list) => list.displayName === ORCA_TODO_LIST_NAME)?.id ??
    (await client.createTodoList(ORCA_TODO_LIST_NAME))
  )
}

/** Brings the Orca To Do list and the follow-up store into agreement; a rerun writes nothing. */
export async function reconcileTodoMirror(
  store: WorkTaskStore,
  client: TodoMirrorClient,
  listId: string
): Promise<TodoMirrorResult> {
  const result: TodoMirrorResult = {
    created: 0,
    moved: 0,
    completedRemote: 0,
    completedLocal: 0,
    deleted: 0
  }
  const remote = await client.listTodoTasks(listId)
  const remoteById = new Map(remote.map((item) => [item.id, item]))
  const localTasks = store.list()
  const localIds = new Set(localTasks.map((task) => task.id))

  for (const task of localTasks) {
    const linkedId = task.outlook?.todoTaskId
    const item = linkedId ? remoteById.get(linkedId) : undefined

    if (linkedId && !item) {
      // Deleted in To Do: treat as dismissed, like completing it.
      if (task.state !== 'done') {
        store.update(task.id, { state: 'done', outlook: undefined })
        result.completedLocal++
      }
      continue
    }

    if (item) {
      const remoteDone = item.status === 'completed'
      if (remoteDone && task.state !== 'done') {
        store.update(task.id, { state: 'done' })
        result.completedLocal++
        continue
      }
      if (!remoteDone && task.state === 'done') {
        await client.updateTodoTask(listId, item.id, { status: 'completed' })
        result.completedRemote++
        continue
      }
      const remindAt = task.remind?.at
      if (isMirrorable(task) && remindAt) {
        const remoteAt = item.reminderDateTime ? graphUtcToIso(item.reminderDateTime) : null
        if (remoteAt !== new Date(remindAt).toISOString()) {
          await client.updateTodoTask(
            listId,
            item.id,
            todoReminder(new Date(remindAt).toISOString())
          )
          store.update(task.id, { outlook: { todoTaskId: item.id, remindAt } })
          result.moved++
        }
      }
      continue
    }

    if (isMirrorable(task) && task.remind && task.remind.firedAt === undefined) {
      const at = new Date(task.remind.at).toISOString()
      const created = await client.createTodoTask(listId, {
        title: task.title,
        body: { content: markerFor(task.id), contentType: 'text' },
        ...todoReminder(at)
      })
      store.update(task.id, { outlook: { todoTaskId: created.id, remindAt: task.remind.at } })
      result.created++
    }
  }

  for (const item of remote) {
    const owner = markedTaskId(item)
    if (owner && !localIds.has(owner)) {
      await client.deleteTodoTask(listId, item.id)
      result.deleted++
    }
  }
  return result
}
