import { z } from 'zod'
import { WORKSPACE_PRIORITIES } from '../workspace-priority'

const nonEmpty = z.string().trim().min(1)
const isoTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected an ISO date'
})

export const workTaskLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('worktree'), worktreeId: nonEmpty, label: nonEmpty }),
  z.object({ kind: z.literal('folder'), workspaceId: nonEmpty, label: nonEmpty }),
  z.object({ kind: z.literal('agent'), worktreeId: nonEmpty, agentId: nonEmpty, label: nonEmpty }),
  z.object({
    kind: z.literal('pr'),
    host: nonEmpty,
    repo: nonEmpty,
    number: z.number().int().positive()
  }),
  z.object({
    kind: z.literal('mr'),
    host: nonEmpty,
    project: nonEmpty,
    iid: z.number().int().positive()
  }),
  z.object({ kind: z.literal('slack'), url: z.string().url() })
])

export const workTaskReminderSchema = z.object({
  at: isoTime,
  whenIdle: z.boolean(),
  firedAt: isoTime.optional()
})

export const workTaskResolutionSchema = z.object({
  at: isoTime,
  reason: z.literal('link-moved')
})

const workTaskFields = {
  title: nonEmpty.max(500),
  durationMin: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  priority: z.enum(WORKSPACE_PRIORITIES).optional(),
  dueAt: isoTime.optional(),
  link: workTaskLinkSchema.optional(),
  remind: workTaskReminderSchema.optional()
}

type IdleCheckable = {
  link?: z.infer<typeof workTaskLinkSchema>
  remind?: z.infer<typeof workTaskReminderSchema>
}

function idleCheckNeedsPullRequest(task: IdleCheckable): boolean {
  return !task.remind?.whenIdle || task.link?.kind === 'pr' || task.link?.kind === 'mr'
}

const idleCheckMessage = {
  message: '"Only if nothing changed" needs a PR or MR link',
  path: ['remind', 'whenIdle']
}

export const workTaskDraftSchema = z
  .object(workTaskFields)
  .refine(idleCheckNeedsPullRequest, idleCheckMessage)

export const workTaskSchema = z
  .object({
    ...workTaskFields,
    id: nonEmpty,
    state: z.enum(['open', 'snoozed', 'done']),
    resolution: workTaskResolutionSchema.optional(),
    createdAt: isoTime,
    updatedAt: isoTime
  })
  .refine(idleCheckNeedsPullRequest, idleCheckMessage)

export type WorkTaskLink = z.infer<typeof workTaskLinkSchema>
export type WorkTaskReminder = z.infer<typeof workTaskReminderSchema>
export type WorkTaskResolution = z.infer<typeof workTaskResolutionSchema>
export type WorkTask = z.infer<typeof workTaskSchema>
export type WorkTaskState = WorkTask['state']
export type WorkTaskDraft = z.infer<typeof workTaskDraftSchema>
