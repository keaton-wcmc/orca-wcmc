import { ZodError } from 'zod'
import { defineMethod, InvalidArgumentError } from '../core'
import {
  WorkTaskCalendarToday,
  WorkTaskMicrosoftConfigure
} from '../../../../shared/rpc-contract/work-task-params'
import { microsoftGraphConfigSchema } from '../../../microsoft-graph/microsoft-graph-config'
import { requireWorkTaskServices } from '../../../work-tasks/work-task-service-registry'

export const WORK_TASK_MICROSOFT_METHODS = [
  defineMethod({
    name: 'workTask.microsoft.status',
    permission: 'workspace',
    params: null,
    handler: () => requireWorkTaskServices().microsoft.status()
  }),
  defineMethod({
    name: 'workTask.microsoft.configure',
    permission: 'workspace',
    params: WorkTaskMicrosoftConfigure,
    handler: (params) => {
      const parsed = microsoftGraphConfigSchema.safeParse(params)
      if (!parsed.success) {
        throw new InvalidArgumentError(
          parsed.error instanceof ZodError
            ? (parsed.error.issues[0]?.message ?? 'Invalid ids')
            : 'Invalid ids'
        )
      }
      return requireWorkTaskServices().microsoft.configure(parsed.data)
    }
  }),
  defineMethod({
    name: 'workTask.microsoft.connect',
    permission: 'workspace',
    params: null,
    handler: () => requireWorkTaskServices().microsoft.connect()
  }),
  defineMethod({
    name: 'workTask.microsoft.disconnect',
    permission: 'workspace',
    params: null,
    handler: () => requireWorkTaskServices().microsoft.disconnect()
  }),
  defineMethod({
    name: 'workTask.calendar.today',
    permission: 'workspace',
    params: WorkTaskCalendarToday,
    handler: async (params) => ({
      day: await requireWorkTaskServices().microsoft.calendarToday(params.refresh === true)
    })
  })
]
