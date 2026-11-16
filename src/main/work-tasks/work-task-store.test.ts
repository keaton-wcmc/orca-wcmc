import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkTaskStore, WorkTaskStoreUnreadableError } from './work-task-store'

describe('WorkTaskStore', () => {
  let dir: string
  let filePath: string
  let clock: Date

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'work-task-store-'))
    filePath = join(dir, 'work-tasks.json')
    clock = new Date('2026-11-16T09:00:00Z')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const open = () => new WorkTaskStore(filePath, () => clock)

  it('round-trips follow-ups through the file', () => {
    const created = open().create({ title: 'Chase DNS change', durationMin: 15 })
    expect(open().list()).toEqual([created])
    expect(created.state).toBe('open')
  })

  it('bumps updatedAt on update and rejects unknown ids', () => {
    const store = open()
    const created = store.create({ title: 'a', durationMin: 30 })
    clock = new Date('2026-11-16T10:00:00Z')
    expect(store.update(created.id, { state: 'done' }).updatedAt).toBe('2026-11-16T10:00:00.000Z')
    expect(() => store.update('missing', { state: 'done' })).toThrow()
    expect(() => store.remove('missing')).toThrow()
  })

  it('notifies listeners once per write', () => {
    const store = open()
    let changes = 0
    store.onChange(() => changes++)
    const created = store.create({ title: 'a', durationMin: 30 })
    store.remove(created.id)
    expect(changes).toBe(2)
  })

  it('refuses to overwrite a file it cannot read', () => {
    writeFileSync(filePath, '{not json')
    const store = open()
    expect(store.readState()).toEqual({ ok: false, error: 'unreadable' })
    expect(() => store.create({ title: 'a', durationMin: 30 })).toThrow(
      WorkTaskStoreUnreadableError
    )
    expect(readFileSync(filePath, 'utf8')).toBe('{not json')
  })

  it('keeps rows it does not understand', () => {
    const future = { id: 'x', kind: 'from-a-newer-build' }
    writeFileSync(filePath, JSON.stringify({ version: 1, tasks: [future] }))
    open().create({ title: 'a', durationMin: 30 })
    expect(JSON.parse(readFileSync(filePath, 'utf8')).tasks[0]).toEqual(future)
  })
})
