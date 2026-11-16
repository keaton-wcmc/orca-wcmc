import { useCallback, useEffect, useState } from 'react'
import { isFollowUpAwaitingUser } from '../../../../shared/work-tasks/work-task-order'
import type { WorkTask, WorkTaskDraft } from '../../../../shared/work-tasks/work-task-types'
import { workTasksClient, type WorkTaskListResult } from './work-tasks-client'

const REFRESH_MS = 30_000

export type UseWorkTasks = {
  tasks: WorkTask[]
  storeState: WorkTaskListResult['storeState']
  storePath: string
  dueCount: number
  error: string | null
  refresh: () => Promise<void>
  create: (draft: WorkTaskDraft) => Promise<void>
  snooze: (id: string, until: string) => Promise<void>
  done: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function countDueFollowUps(tasks: readonly WorkTask[]): number {
  return tasks.filter(isFollowUpAwaitingUser).length
}

export function useWorkTasks(): UseWorkTasks {
  const [list, setList] = useState<WorkTaskListResult>({
    tasks: [],
    storeState: { ok: true },
    storePath: ''
  })
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setList(await workTasksClient.list())
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const mutate = useCallback(
    async (operation: () => Promise<unknown>) => {
      try {
        await operation()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
      await refresh()
    },
    [refresh]
  )

  return {
    ...list,
    dueCount: countDueFollowUps(list.tasks),
    error,
    refresh,
    create: (draft) => mutate(() => workTasksClient.create(draft)),
    snooze: (id, until) => mutate(() => workTasksClient.snooze(id, until)),
    done: (id) => mutate(() => workTasksClient.done(id)),
    remove: (id) => mutate(() => workTasksClient.remove(id))
  }
}
