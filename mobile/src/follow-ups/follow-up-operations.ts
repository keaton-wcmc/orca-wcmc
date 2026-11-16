import { z } from 'zod'
import { isFollowUpAwaitingUser } from '../../../src/shared/work-tasks/work-task-order'
import type { WorkTask } from '../../../src/shared/work-tasks/work-task-types'
import { workTaskSchema } from '../../../src/shared/work-tasks/work-task-types'
import { WORK_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/work-tasks/work-tasks-runtime-capability'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'

// Rows from a newer desktop that this phone cannot parse are dropped, not fatal.
const followUpListSchema = z.object({
  tasks: z.array(z.unknown()).transform((rows) =>
    rows.flatMap((row) => {
      const parsed = workTaskSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
  )
})

const UPCOMING_LIMIT = 5

const followUpResultSchema = z.object({ task: workTaskSchema })

export const followUpListRead = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'workTask.mobile-list',
    method: 'workTask.list',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('work-tasks', followUpListSchema)
  })
)

export const followUpSnoozeWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'workTask.mobile-snooze',
    method: 'workTask.snooze',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('work-task', followUpResultSchema)
  })
)

export const followUpDoneWrite = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'workTask.mobile-done',
    method: 'workTask.done',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('work-task', followUpResultSchema)
  })
)

export function hostSupportsFollowUps(capabilities: readonly string[] | undefined): boolean {
  return capabilities?.includes(WORK_TASKS_RUNTIME_CAPABILITY) === true
}

export function selectFollowUpRows(tasks: readonly WorkTask[]): WorkTask[] {
  const due = tasks.filter(isFollowUpAwaitingUser)
  const upcoming = tasks
    .filter((task) => !isFollowUpAwaitingUser(task) && task.state !== 'done' && task.remind)
    .slice(0, UPCOMING_LIMIT)
  return [...due, ...upcoming]
}
