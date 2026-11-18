import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAuthorizeUrl, pkceChallengeFor, createPkcePair } from './graph-pkce'
import { GraphTokenStore, MicrosoftReconnectRequiredError } from './graph-token-store'
import type { SecretCipher } from './sealed-json-file'

vi.mock('electron', () => ({ safeStorage: {} }))

const config = {
  clientId: 'aeac42ee-9104-4dd6-9efc-a024538adf97',
  tenantId: '2faab858-d1f4-48af-86f6-486196d5969d'
}
const plainCipher: SecretCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text),
  decryptString: (cipher) => cipher.toString()
}

describe('PKCE', () => {
  it('derives the S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(challenge).toBe(pkceChallengeFor(verifier))
    // RFC 7636 appendix B test vector.
    expect(pkceChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    )
  })

  it('builds an authorise URL for the tenant with every parameter', () => {
    const url = new URL(buildAuthorizeUrl(config, 'http://localhost:51234', 'challenge', 'state'))
    expect(url.origin + url.pathname).toBe(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`
    )
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: 'http://localhost:51234',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
      state: 'state',
      scope: 'offline_access User.Read Calendars.ReadWrite Tasks.ReadWrite MailboxSettings.Read'
    })
  })
})

describe('GraphTokenStore', () => {
  let dir: string
  let now: number
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'graph-tokens-'))
    now = 1_000_000
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const store = (fetchImpl: typeof fetch) =>
    new GraphTokenStore(join(dir, 'tokens.enc'), { cipher: plainCipher, now: () => now, fetchImpl })

  it('reuses a fresh token and refreshes only near expiry', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 })
    )
    const tokens = store(fetchImpl)
    tokens.save({ accessToken: 'old', refreshToken: 'r1', expiresAt: now + 10 * 60_000 })
    await expect(tokens.getAccessToken(config)).resolves.toBe('old')
    expect(fetchImpl).not.toHaveBeenCalled()
    now += 9 * 60_000
    await expect(tokens.getAccessToken(config)).resolves.toBe('new')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('r1')
    expect(body.has('client_secret')).toBe(false)
  })

  it('asks to reconnect when the refresh token is rejected', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: 'invalid_grant', error_description: 'expired' }, { status: 400 })
    )
    const tokens = store(fetchImpl)
    tokens.save({ accessToken: 'old', refreshToken: 'r1', expiresAt: now })
    await expect(tokens.getAccessToken(config)).rejects.toBeInstanceOf(
      MicrosoftReconnectRequiredError
    )
    expect(tokens.state()).toBe('reconnect-required')
  })

  it('shares one refresh between concurrent callers', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 })
    )
    const tokens = store(fetchImpl)
    tokens.save({ accessToken: 'old', refreshToken: 'r1', expiresAt: now })
    await Promise.all([tokens.getAccessToken(config), tokens.getAccessToken(config)])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
