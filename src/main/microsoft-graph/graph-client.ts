import { z, type ZodType } from 'zod'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const MAX_THROTTLE_RETRIES = 2
const DEFAULT_RETRY_AFTER_S = 5

export class GraphRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GraphRequestError'
    this.status = status
  }
}

export type GraphAuth = { getAccessToken: (force?: boolean) => Promise<string> }

const graphDateTime = z.object({ dateTime: z.string(), timeZone: z.string() })

export const graphEventSchema = z.object({
  id: z.string(),
  subject: z.string().nullable().optional(),
  start: graphDateTime,
  end: graphDateTime,
  showAs: z.string().optional(),
  categories: z.array(z.string()).optional(),
  isAllDay: z.boolean().optional(),
  isCancelled: z.boolean().optional()
})
export type GraphEvent = z.infer<typeof graphEventSchema>

export const graphTodoTaskSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  status: z.string(),
  reminderDateTime: graphDateTime.nullable().optional(),
  body: z.object({ content: z.string().optional() }).optional(),
  lastModifiedDateTime: z.string().optional()
})
export type GraphTodoTask = z.infer<typeof graphTodoTaskSchema>

const workingHoursSchema = z.object({
  daysOfWeek: z.array(z.string()),
  startTime: z.string(),
  endTime: z.string(),
  timeZone: z.object({ name: z.string() }).optional()
})
export const mailboxSettingsSchema = z.object({
  timeZone: z.string().optional(),
  workingHours: workingHoursSchema.optional()
})
export type GraphMailboxSettings = z.infer<typeof mailboxSettingsSchema>

const meSchema = z.object({
  displayName: z.string().nullable().optional(),
  userPrincipalName: z.string().optional(),
  mail: z.string().nullable().optional()
})

const page = <T extends ZodType>(item: T) =>
  z.object({ value: z.array(item), '@odata.nextLink': z.string().optional() })

/** Graph values are UTC when requested with Prefer: outlook.timezone="UTC". */
export function graphUtcToIso(value: { dateTime: string }): string {
  return new Date(
    /[zZ]|[+-]\d\d:\d\d$/.test(value.dateTime) ? value.dateTime : `${value.dateTime}Z`
  ).toISOString()
}

export class GraphClient {
  private readonly auth: GraphAuth
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    auth: GraphAuth,
    fetchImpl: typeof fetch = fetch,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
  ) {
    this.auth = auth
    this.fetchImpl = fetchImpl
    this.sleep = sleep
  }

  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let refreshed = false
    let throttled = 0
    for (;;) {
      const token = await this.auth.getAccessToken(refreshed)
      const response = await this.fetchImpl(
        path.startsWith('https://') ? path : `${GRAPH}${path}`,
        {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            prefer: 'outlook.timezone="UTC"',
            ...(body === undefined ? {} : { 'content-type': 'application/json' })
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        }
      )
      if (response.status === 401 && !refreshed) {
        refreshed = true
        continue
      }
      if (
        (response.status === 429 || response.status === 503) &&
        throttled < MAX_THROTTLE_RETRIES
      ) {
        throttled++
        const seconds = Number(response.headers.get('retry-after')) || DEFAULT_RETRY_AFTER_S
        await this.sleep(seconds * 1000)
        continue
      }
      if (response.status === 204) {
        return null
      }
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message = z.object({ error: z.object({ message: z.string() }) }).safeParse(json)
        throw new GraphRequestError(
          response.status,
          message.success ? message.data.error.message : `Graph returned HTTP ${response.status}`
        )
      }
      return json
    }
  }

  private async get<T>(path: string, schema: ZodType<T>): Promise<T> {
    return schema.parse(await this.request('GET', path))
  }

  private async getAll<T extends ZodType>(path: string, item: T): Promise<z.infer<T>[]> {
    const rows: z.infer<T>[] = []
    let next: string | undefined = path
    while (next) {
      const result: z.infer<ReturnType<typeof page<T>>> = await this.get(next, page(item))
      rows.push(...result.value)
      next = result['@odata.nextLink']
    }
    return rows
  }

  async me(): Promise<string> {
    const me = await this.get('/me?$select=displayName,userPrincipalName,mail', meSchema)
    return me.userPrincipalName ?? me.mail ?? me.displayName ?? 'Microsoft account'
  }

  mailboxSettings(): Promise<GraphMailboxSettings> {
    return this.get('/me/mailboxSettings', mailboxSettingsSchema)
  }

  calendarView(startIso: string, endIso: string): Promise<GraphEvent[]> {
    const query = new URLSearchParams({
      startDateTime: startIso,
      endDateTime: endIso,
      $select: 'subject,start,end,showAs,categories,isAllDay,isCancelled',
      $orderby: 'start/dateTime',
      $top: '100'
    })
    return this.getAll(`/me/calendarView?${query.toString()}`, graphEventSchema)
  }

  todoLists(): Promise<{ id: string; displayName: string }[]> {
    return this.getAll('/me/todo/lists', z.object({ id: z.string(), displayName: z.string() }))
  }

  async createTodoList(displayName: string): Promise<string> {
    const created = z
      .object({ id: z.string() })
      .parse(await this.request('POST', '/me/todo/lists', { displayName }))
    return created.id
  }

  listTodoTasks(listId: string): Promise<GraphTodoTask[]> {
    return this.getAll(
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$top=100`,
      graphTodoTaskSchema
    )
  }

  async createTodoTask(listId: string, task: Record<string, unknown>): Promise<GraphTodoTask> {
    return graphTodoTaskSchema.parse(
      await this.request('POST', `/me/todo/lists/${encodeURIComponent(listId)}/tasks`, task)
    )
  }

  async updateTodoTask(
    listId: string,
    taskId: string,
    patch: Record<string, unknown>
  ): Promise<void> {
    await this.request(
      'PATCH',
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      patch
    )
  }

  async deleteTodoTask(listId: string, taskId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`
    )
  }
}
