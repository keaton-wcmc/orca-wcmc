import type { z } from 'zod'
import { defineMethod, InvalidArgumentError } from '../core'
import {
  WorkTaskCreate,
  WorkTaskDone,
  WorkTaskRemove,
  WorkTaskSlackWebhookSet,
  WorkTaskSnooze,
  WorkTaskUpdate
} from '../../../../shared/rpc-contract/work-task-params'
import { orderWorkTasks } from '../../../../shared/work-tasks/work-task-order'
import type { WorkTask } from '../../../../shared/work-tasks/work-task-types'
import { postSlackWebhook } from '../../../follow-up-reminders/slack-webhook-delivery'
import { requireWorkTaskServices } from '../../../work-tasks/work-task-service-registry'
import type { WorkTaskPatch } from '../../../work-tasks/work-task-store'

const RECENTLY_RESOLVED_MS = 24 * 60 * 60 * 1000

function requireTask(id: string): WorkTask {
  const task = requireWorkTaskServices().store.get(id)
  if (!task) {
    throw new InvalidArgumentError(`No follow-up with id ${id}`)
  }
  return task
}

/** Absent keys stay unchanged; null on the wire clears, which the store reads as undefined. */
function toStorePatch(patch: z.infer<typeof WorkTaskUpdate>['patch']): WorkTaskPatch {
  const next: WorkTaskPatch = {}
  if (patch.title !== undefined) {
    next.title = patch.title
  }
  if (patch.durationMin !== undefined) {
    next.durationMin = patch.durationMin
  }
  if ('priority' in patch) {
    next.priority = patch.priority ?? undefined
  }
  if ('dueAt' in patch) {
    next.dueAt = patch.dueAt ?? undefined
  }
  if ('link' in patch) {
    next.link = patch.link ?? undefined
  }
  if ('remind' in patch) {
    next.remind = patch.remind ?? undefined
  }
  return next
}

export const WORK_TASK_METHODS = [
  defineMethod({
    name: 'workTask.list',
    permission: 'workspace',
    params: null,
    handler: () => {
      const { store, now, linkedPriority } = requireWorkTaskServices()
      const at = now()
      const all = store.list()
      const recentlyResolved = all.filter(
        (task) =>
          task.state === 'done' &&
          task.resolution !== undefined &&
          at.getTime() - Date.parse(task.resolution.at) < RECENTLY_RESOLVED_MS
      )
      return {
        tasks: [...orderWorkTasks(all, at, linkedPriority), ...recentlyResolved],
        storeState: store.readState(),
        storePath: store.path
      }
    }
  }),
  defineMethod({
    name: 'workTask.create',
    permission: 'workspace',
    params: WorkTaskCreate,
    handler: (params) => ({ task: requireWorkTaskServices().store.create(params) })
  }),
  defineMethod({
    name: 'workTask.update',
    permission: 'workspace',
    params: WorkTaskUpdate,
    handler: ({ id, patch }) => {
      requireTask(id)
      return { task: requireWorkTaskServices().store.update(id, toStorePatch(patch)) }
    }
  }),
  defineMethod({
    name: 'workTask.snooze',
    permission: 'workspace',
    params: WorkTaskSnooze,
    handler: ({ id, until }) => {
      const task = requireTask(id)
      const at = new Date(until).toISOString()
      return {
        task: requireWorkTaskServices().store.update(id, {
          state: 'snoozed',
          remind: { at, whenIdle: task.remind?.whenIdle ?? false }
        })
      }
    }
  }),
  defineMethod({
    name: 'workTask.done',
    permission: 'workspace',
    params: WorkTaskDone,
    handler: ({ id }) => {
      requireTask(id)
      return { task: requireWorkTaskServices().store.update(id, { state: 'done' }) }
    }
  }),
  defineMethod({
    name: 'workTask.remove',
    permission: 'workspace',
    params: WorkTaskRemove,
    handler: ({ id }) => {
      requireTask(id)
      requireWorkTaskServices().store.remove(id)
      return {}
    }
  }),
  defineMethod({
    name: 'workTask.slackWebhook.status',
    permission: 'workspace',
    params: null,
    handler: () => requireWorkTaskServices().slackWebhook.status()
  }),
  defineMethod({
    name: 'workTask.slackWebhook.set',
    permission: 'workspace',
    params: WorkTaskSlackWebhookSet,
    handler: ({ url }) => {
      const { slackWebhook } = requireWorkTaskServices()
      try {
        slackWebhook.write(url)
      } catch (error) {
        throw new InvalidArgumentError(error instanceof Error ? error.message : String(error))
      }
      return slackWebhook.status()
    }
  }),
  defineMethod({
    name: 'workTask.slackWebhook.clear',
    permission: 'workspace',
    params: null,
    handler: () => {
      const { slackWebhook } = requireWorkTaskServices()
      slackWebhook.clear()
      return slackWebhook.status()
    }
  }),
  defineMethod({
    name: 'workTask.slackWebhook.test',
    permission: 'workspace',
    params: null,
    handler: async () => {
      const { slackWebhook } = requireWorkTaskServices()
      const url = slackWebhook.read()
      if (!url) {
        return { ok: false, error: 'No Slack webhook is set' }
      }
      const result = await postSlackWebhook(url, ':white_check_mark: Orca follow-ups can post here')
      slackWebhook.recordError(result.ok ? null : (result.error ?? 'Slack webhook failed'))
      return result
    }
  })
]
