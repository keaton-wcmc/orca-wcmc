import type { WorkTaskStore } from '../work-tasks/work-task-store'
import { GraphClient } from './graph-client'
import { runLoopbackSignIn } from './graph-sign-in'
import type { GraphTokenStore, MicrosoftConnectionState } from './graph-token-store'
import type { MicrosoftGraphConfig, MicrosoftGraphConfigFile } from './microsoft-graph-config'
import { localDayRange, summariseCalendarDay, type CalendarDay } from './outlook-calendar'
import { ensureOrcaTodoList, reconcileTodoMirror } from './outlook-todo-mirror'

const MIRROR_INTERVAL_MS = 5 * 60_000
const MIRROR_DEBOUNCE_MS = 5_000
const CALENDAR_TTL_MS = 5 * 60_000

export type MicrosoftStatus = {
  configured: boolean
  config?: MicrosoftGraphConfig
  state: MicrosoftConnectionState
  account?: string
  lastError?: string
  lastMirrorAt?: string
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Owns the Microsoft connection: sign-in, the To Do mirror loop and the calendar cache. */
export class MicrosoftIntegration {
  private readonly config: MicrosoftGraphConfigFile
  private readonly tokens: GraphTokenStore
  private readonly store: WorkTaskStore
  private readonly openBrowser: (url: string) => unknown
  private readonly now: () => Date
  private timer: ReturnType<typeof setInterval> | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null
  private mirroring: Promise<void> | null = null
  private listId: string | null = null
  private calendar: CalendarDay | null = null
  private lastError: string | undefined
  private lastMirrorAt: string | undefined

  constructor(deps: {
    config: MicrosoftGraphConfigFile
    tokens: GraphTokenStore
    store: WorkTaskStore
    openBrowser: (url: string) => unknown
    now?: () => Date
  }) {
    this.config = deps.config
    this.tokens = deps.tokens
    this.store = deps.store
    this.openBrowser = deps.openBrowser
    this.now = deps.now ?? (() => new Date())
  }

  status(): MicrosoftStatus {
    const config = this.config.read()
    const account = this.tokens.account()
    return {
      configured: config !== null,
      ...(config ? { config } : {}),
      state: this.tokens.state(),
      ...(account ? { account } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      ...(this.lastMirrorAt ? { lastMirrorAt: this.lastMirrorAt } : {})
    }
  }

  configure(config: MicrosoftGraphConfig): MicrosoftStatus {
    const previous = this.config.read()
    this.config.write(config)
    if (
      previous &&
      (previous.clientId !== config.clientId || previous.tenantId !== config.tenantId)
    ) {
      this.disconnect()
    }
    return this.status()
  }

  async connect(): Promise<MicrosoftStatus> {
    const config = this.requireConfig()
    const grant = await runLoopbackSignIn(config, { openBrowser: this.openBrowser })
    this.tokens.save(grant)
    const account = await this.client(config).me()
    this.tokens.setAccount(account)
    this.lastError = undefined
    this.listId = null
    this.calendar = null
    void this.mirrorNow()
    return this.status()
  }

  disconnect(): MicrosoftStatus {
    this.tokens.clear()
    this.listId = null
    this.calendar = null
    this.lastError = undefined
    return this.status()
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => void this.mirrorNow(), MIRROR_INTERVAL_MS)
    this.unsubscribe = this.store.onChange(() => this.scheduleMirror())
    void this.mirrorNow()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.debounce) {
      clearTimeout(this.debounce)
      this.debounce = null
    }
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  async calendarToday(force = false): Promise<CalendarDay | null> {
    const config = this.config.read()
    if (!config || this.tokens.state() !== 'connected') {
      return null
    }
    const now = this.now()
    const range = localDayRange(now)
    const fresh =
      this.calendar &&
      this.calendar.start === range.start &&
      now.getTime() - Date.parse(this.calendar.fetchedAt) < CALENDAR_TTL_MS
    if (fresh && !force) {
      return this.calendar
    }
    try {
      const client = this.client(config)
      const [events, mailbox] = await Promise.all([
        client.calendarView(range.start, range.end),
        client.mailboxSettings()
      ])
      this.calendar = summariseCalendarDay(events, mailbox, range, now)
      return this.calendar
    } catch (error) {
      this.lastError = message(error)
      return this.calendar
    }
  }

  private scheduleMirror(): void {
    if (this.debounce) {
      clearTimeout(this.debounce)
    }
    this.debounce = setTimeout(() => {
      this.debounce = null
      void this.mirrorNow()
    }, MIRROR_DEBOUNCE_MS)
  }

  /** Never throws: Outlook trouble must not disturb local reminders. */
  mirrorNow(): Promise<void> {
    this.mirroring ??= this.runMirror().finally(() => {
      this.mirroring = null
    })
    return this.mirroring
  }

  private async runMirror(): Promise<void> {
    const config = this.config.read()
    if (!config || this.tokens.state() !== 'connected' || !this.store.readState().ok) {
      return
    }
    try {
      const client = this.client(config)
      this.listId ??= await ensureOrcaTodoList(client)
      await reconcileTodoMirror(this.store, client, this.listId)
      this.lastError = undefined
      this.lastMirrorAt = this.now().toISOString()
    } catch (error) {
      this.lastError = message(error)
      console.warn('[follow-ups] Outlook To Do mirror failed:', this.lastError)
    }
  }

  private client(config: MicrosoftGraphConfig): GraphClient {
    return new GraphClient({ getAccessToken: (force) => this.tokens.getAccessToken(config, force) })
  }

  private requireConfig(): MicrosoftGraphConfig {
    const config = this.config.read()
    if (!config) {
      throw new Error('Set the Microsoft client and tenant ids first')
    }
    return config
  }
}
