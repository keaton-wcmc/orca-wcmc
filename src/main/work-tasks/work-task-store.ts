import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { writeDurableSecureJsonFile } from '../../shared/secure-file'
import {
  workTaskSchema,
  type WorkTask,
  type WorkTaskDraft,
  type WorkTaskOutlook,
  type WorkTaskResolution,
  type WorkTaskState
} from '../../shared/work-tasks/work-task-types'

export type WorkTaskStoreReadState = { ok: true } | { ok: false; error: 'unreadable' }

export type WorkTaskPatch = Partial<WorkTaskDraft> & {
  state?: WorkTaskState
  resolution?: WorkTaskResolution
  outlook?: WorkTaskOutlook
}

export class WorkTaskStoreUnreadableError extends Error {
  constructor(filePath: string) {
    super(`Follow-ups file ${filePath} could not be read; refusing to overwrite it`)
    this.name = 'WorkTaskStoreUnreadableError'
  }
}

type PersistedFile = { version: 1; tasks: unknown[] }

export class WorkTaskStore {
  private readonly filePath: string
  private readonly now: () => Date
  private readonly newId: () => string
  private readonly listeners = new Set<() => void>()
  /** Every row on disk, valid or not, so rows from a newer build survive our writes. */
  private rows: unknown[] = []
  private unreadable = false

  constructor(filePath: string, now: () => Date = () => new Date(), newId = randomUUID) {
    this.filePath = filePath
    this.now = now
    this.newId = newId
    this.load()
  }

  get path(): string {
    return this.filePath
  }

  readState(): WorkTaskStoreReadState {
    return this.unreadable ? { ok: false, error: 'unreadable' } : { ok: true }
  }

  list(): WorkTask[] {
    return this.rows.flatMap((row) => {
      const parsed = workTaskSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  }

  get(id: string): WorkTask | undefined {
    return this.list().find((task) => task.id === id)
  }

  create(draft: WorkTaskDraft): WorkTask {
    const at = this.now().toISOString()
    const task = workTaskSchema.parse({
      ...draft,
      id: this.newId(),
      state: 'open',
      createdAt: at,
      updatedAt: at
    })
    this.write([...this.rows, task])
    return task
  }

  update(id: string, patch: WorkTaskPatch): WorkTask {
    const index = this.indexOf(id)
    const current = workTaskSchema.parse(this.rows[index])
    const next = workTaskSchema.parse({
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: this.now().toISOString()
    })
    const rows = [...this.rows]
    rows[index] = next
    this.write(rows)
    return next
  }

  remove(id: string): void {
    const index = this.indexOf(id)
    this.write(this.rows.filter((_, i) => i !== index))
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private indexOf(id: string): number {
    const index = this.rows.findIndex((row) => workTaskSchema.safeParse(row).data?.id === id)
    if (index === -1) {
      throw new Error(`No follow-up with id ${id}`)
    }
    return index
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (!isPersistedFile(parsed)) {
        this.unreadable = true
        return
      }
      this.rows = parsed.tasks
    } catch {
      this.unreadable = true
    }
  }

  private write(rows: unknown[]): void {
    if (this.unreadable) {
      throw new WorkTaskStoreUnreadableError(this.filePath)
    }
    const file: PersistedFile = { version: 1, tasks: rows }
    writeDurableSecureJsonFile(this.filePath, file)
    this.rows = rows
    for (const listener of this.listeners) {
      listener()
    }
  }
}

function isPersistedFile(value: unknown): value is PersistedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1 &&
    'tasks' in value &&
    Array.isArray(value.tasks)
  )
}
