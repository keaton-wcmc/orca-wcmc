import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkTaskStore } from '../work-tasks/work-task-store'
import { graphTodoTaskSchema, type GraphTodoTask } from './graph-client'
import { reconcileTodoMirror, type TodoMirrorClient } from './outlook-todo-mirror'

class FakeTodo implements TodoMirrorClient {
  items = new Map<string, GraphTodoTask>()
  writes = 0
  private next = 1
  async todoLists() {
    return [{ id: 'list', displayName: 'Orca' }]
  }
  async createTodoList() {
    return 'list'
  }
  async listTodoTasks() {
    return [...this.items.values()]
  }
  async createTodoTask(_listId: string, task: Record<string, unknown>) {
    this.writes++
    const id = `todo-${this.next++}`
    const item = graphTodoTaskSchema.parse({ ...task, id, status: 'notStarted' })
    this.items.set(id, item)
    return item
  }
  async updateTodoTask(_listId: string, taskId: string, patch: Record<string, unknown>) {
    this.writes++
    const current = this.items.get(taskId)
    if (current) {
      this.items.set(taskId, graphTodoTaskSchema.parse({ ...current, ...patch }))
    }
  }
  async deleteTodoTask(_listId: string, taskId: string) {
    this.writes++
    this.items.delete(taskId)
  }
}

describe('reconcileTodoMirror', () => {
  let dir: string
  let store: WorkTaskStore
  let todo: FakeTodo
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'todo-mirror-'))
    store = new WorkTaskStore(join(dir, 'work-tasks.json'), () => new Date('2026-11-18T09:00:00Z'))
    todo = new FakeTodo()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const remindAt = '2026-11-19T09:00:00.000Z'

  it('creates one To Do item per fixed-time reminder, and a rerun writes nothing', async () => {
    const task = store.create({
      title: 'Chase DNS',
      durationMin: 15,
      remind: { at: remindAt, whenIdle: false }
    })
    store.create({ title: 'No reminder', durationMin: 15 })
    expect(await reconcileTodoMirror(store, todo, 'list')).toMatchObject({ created: 1 })
    const [item] = [...todo.items.values()]
    expect(item.reminderDateTime).toEqual({ dateTime: '2026-11-19T09:00:00.000', timeZone: 'UTC' })
    expect(store.get(task.id)?.outlook?.todoTaskId).toBe(item.id)
    const writes = todo.writes
    await reconcileTodoMirror(store, todo, 'list')
    expect(todo.writes).toBe(writes)
  })

  it('never mirrors an idle-only reminder', async () => {
    store.create({
      title: 'Nudge review',
      durationMin: 15,
      link: { kind: 'pr', host: 'github.com', repo: 'a/b', number: 1 },
      remind: { at: remindAt, whenIdle: true }
    })
    expect(await reconcileTodoMirror(store, todo, 'list')).toMatchObject({ created: 0 })
  })

  it('moves the To Do reminder when the follow-up is snoozed', async () => {
    const task = store.create({
      title: 'x',
      durationMin: 15,
      remind: { at: remindAt, whenIdle: false }
    })
    await reconcileTodoMirror(store, todo, 'list')
    store.update(task.id, { remind: { at: '2026-11-20T09:00:00.000Z', whenIdle: false } })
    expect(await reconcileTodoMirror(store, todo, 'list')).toMatchObject({ moved: 1 })
    expect([...todo.items.values()][0].reminderDateTime?.dateTime).toBe('2026-11-20T09:00:00.000')
  })

  it('carries completion both ways', async () => {
    const doneHere = store.create({
      title: 'a',
      durationMin: 15,
      remind: { at: remindAt, whenIdle: false }
    })
    const doneThere = store.create({
      title: 'b',
      durationMin: 15,
      remind: { at: remindAt, whenIdle: false }
    })
    await reconcileTodoMirror(store, todo, 'list')
    store.update(doneHere.id, { state: 'done' })
    const remoteId = store.get(doneThere.id)?.outlook?.todoTaskId ?? ''
    await todo.updateTodoTask('list', remoteId, { status: 'completed' })
    expect(await reconcileTodoMirror(store, todo, 'list')).toMatchObject({
      completedRemote: 1,
      completedLocal: 1
    })
    expect(store.get(doneThere.id)?.state).toBe('done')
  })

  it("deletes items for removed follow-ups but leaves the user's own items alone", async () => {
    const task = store.create({
      title: 'a',
      durationMin: 15,
      remind: { at: remindAt, whenIdle: false }
    })
    await reconcileTodoMirror(store, todo, 'list')
    todo.items.set('mine', { id: 'mine', status: 'notStarted', title: 'Buy milk' })
    store.remove(task.id)
    expect(await reconcileTodoMirror(store, todo, 'list')).toMatchObject({ deleted: 1 })
    expect([...todo.items.keys()]).toEqual(['mine'])
  })
})
