import { z } from 'zod'
import {
  workTaskDraftSchema,
  workTaskLinkSchema,
  workTaskReminderSchema
} from '../work-tasks/work-task-types'
import { WORKSPACE_PRIORITIES } from '../workspace-priority'

const WorkTaskId = z.object({ id: z.string().trim().min(1, 'Missing follow-up id') })

export const WorkTaskCreate = workTaskDraftSchema

export const WorkTaskUpdate = z.object({
  id: z.string().trim().min(1, 'Missing follow-up id'),
  patch: z.object({
    title: z.string().trim().min(1).max(500).optional(),
    durationMin: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional(),
    priority: z.enum(WORKSPACE_PRIORITIES).nullable().optional(),
    dueAt: z.string().nullable().optional(),
    link: workTaskLinkSchema.nullable().optional(),
    remind: workTaskReminderSchema.nullable().optional()
  })
})

export const WorkTaskSnooze = WorkTaskId.extend({
  until: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Expected an ISO date'
  })
})

export const WorkTaskDone = WorkTaskId
export const WorkTaskRemove = WorkTaskId

export const WorkTaskSlackWebhookSet = z.object({
  url: z.string().trim().min(1, 'Missing webhook URL')
})
