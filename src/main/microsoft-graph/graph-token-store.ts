import { z } from 'zod'
import type { MicrosoftGraphConfig } from './microsoft-graph-config'
import { GraphTokenError, requestGraphToken, type GraphTokenGrant } from './graph-pkce'
import { SealedJsonFile, type SecretCipher } from './sealed-json-file'

const REFRESH_BEFORE_MS = 2 * 60_000

const storedTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
  account: z.string().optional()
})
type StoredTokens = z.infer<typeof storedTokensSchema>

export type MicrosoftConnectionState = 'disconnected' | 'connected' | 'reconnect-required'

export class MicrosoftReconnectRequiredError extends Error {
  constructor() {
    super('Reconnect Microsoft in the Plan page')
    this.name = 'MicrosoftReconnectRequiredError'
  }
}

/** Sealed Graph tokens with refresh shortly before expiry. */
export class GraphTokenStore {
  private readonly file: SealedJsonFile<StoredTokens>
  private readonly now: () => number
  private readonly fetchImpl: typeof fetch
  private reconnectRequired = false
  private refreshing: Promise<string> | null = null

  constructor(
    filePath: string,
    options: { cipher?: SecretCipher; now?: () => number; fetchImpl?: typeof fetch } = {}
  ) {
    this.file = new SealedJsonFile(
      filePath,
      storedTokensSchema,
      'Microsoft sign-in',
      options.cipher
    )
    this.now = options.now ?? Date.now
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  state(): MicrosoftConnectionState {
    if (this.file.read()) {
      return 'connected'
    }
    return this.reconnectRequired ? 'reconnect-required' : 'disconnected'
  }

  account(): string | undefined {
    return this.file.read()?.account
  }

  save(grant: GraphTokenGrant, account?: string): void {
    if (!grant.refreshToken) {
      throw new GraphTokenError('no_refresh_token', 'Microsoft did not return a refresh token')
    }
    this.file.write({
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      expiresAt: grant.expiresAt,
      ...(account ? { account } : {})
    })
    this.reconnectRequired = false
  }

  setAccount(account: string): void {
    const tokens = this.file.read()
    if (tokens) {
      this.file.write({ ...tokens, account })
    }
  }

  clear(): void {
    this.file.clear()
    this.reconnectRequired = false
  }

  async getAccessToken(config: MicrosoftGraphConfig, force = false): Promise<string> {
    const tokens = this.file.read()
    if (!tokens) {
      throw new MicrosoftReconnectRequiredError()
    }
    if (!force && tokens.expiresAt - this.now() > REFRESH_BEFORE_MS) {
      return tokens.accessToken
    }
    // One refresh at a time; Entra rotates refresh tokens, so parallel refreshes would race.
    this.refreshing ??= this.refresh(config, tokens).finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async refresh(config: MicrosoftGraphConfig, tokens: StoredTokens): Promise<string> {
    try {
      const grant = await requestGraphToken(
        config,
        { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
        this.now(),
        this.fetchImpl
      )
      this.file.write({
        ...tokens,
        accessToken: grant.accessToken,
        refreshToken: grant.refreshToken ?? tokens.refreshToken,
        expiresAt: grant.expiresAt
      })
      return grant.accessToken
    } catch (error) {
      if (error instanceof GraphTokenError && error.code === 'invalid_grant') {
        this.file.clear()
        this.reconnectRequired = true
        throw new MicrosoftReconnectRequiredError()
      }
      throw error
    }
  }
}
