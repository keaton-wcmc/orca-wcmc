import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { MicrosoftGraphConfig } from './microsoft-graph-config'

export const GRAPH_SCOPES = [
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
  'Tasks.ReadWrite',
  'MailboxSettings.Read'
] as const

const LOGIN_HOST = 'https://login.microsoftonline.com'

export type PkcePair = { verifier: string; challenge: string }

export function pkceChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString('base64url')
  return { verifier, challenge: pkceChallengeFor(verifier) }
}

export function buildAuthorizeUrl(
  config: MicrosoftGraphConfig,
  redirectUri: string,
  challenge: string,
  state: string
): string {
  const url = new URL(`${LOGIN_HOST}/${config.tenantId}/oauth2/v2.0/authorize`)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: GRAPH_SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account'
  }).toString()
  return url.toString()
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive()
})

export type GraphTokenGrant = { accessToken: string; refreshToken?: string; expiresAt: number }

export class GraphTokenError extends Error {
  readonly code: string
  constructor(code: string, description: string) {
    super(description || code)
    this.name = 'GraphTokenError'
    this.code = code
  }
}

/** Public-client token call: no secret, so possession of the verifier or refresh token is the proof. */
export async function requestGraphToken(
  config: MicrosoftGraphConfig,
  params: Record<string, string>,
  now: number,
  fetchImpl: typeof fetch = fetch
): Promise<GraphTokenGrant> {
  const response = await fetchImpl(`${LOGIN_HOST}/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      scope: GRAPH_SCOPES.join(' '),
      ...params
    }).toString()
  })
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const failure = z
      .object({ error: z.string(), error_description: z.string().optional() })
      .safeParse(body)
    throw failure.success
      ? new GraphTokenError(
          failure.data.error,
          failure.data.error_description?.split('\r\n')[0] ?? ''
        )
      : new GraphTokenError(
          'token_request_failed',
          `Token endpoint returned HTTP ${response.status}`
        )
  }
  const grant = tokenResponseSchema.parse(body)
  return {
    accessToken: grant.access_token,
    ...(grant.refresh_token ? { refreshToken: grant.refresh_token } : {}),
    expiresAt: now + grant.expires_in * 1000
  }
}
