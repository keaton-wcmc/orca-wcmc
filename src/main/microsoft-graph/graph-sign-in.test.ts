import { describe, expect, it, vi } from 'vitest'
import { runLoopbackSignIn } from './graph-sign-in'
import { pkceChallengeFor } from './graph-pkce'

const config = {
  clientId: 'aeac42ee-9104-4dd6-9efc-a024538adf97',
  tenantId: '2faab858-d1f4-48af-86f6-486196d5969d'
}

describe('runLoopbackSignIn', () => {
  it('ignores a callback with the wrong state and exchanges the right one with the verifier', async () => {
    const tokenFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 })
    )
    let challenge = ''
    const grant = await runLoopbackSignIn(config, {
      fetchImpl: tokenFetch,
      now: () => 0,
      openBrowser: async (authorizeUrl: string) => {
        const url = new URL(authorizeUrl)
        challenge = url.searchParams.get('code_challenge') ?? ''
        const redirect = url.searchParams.get('redirect_uri') ?? ''
        const port = new URL(redirect).port
        const forged = await fetch(`http://127.0.0.1:${port}/?code=evil&state=wrong`)
        expect(forged.status).toBe(400)
        const real = await fetch(
          `http://127.0.0.1:${port}/?code=good&state=${url.searchParams.get('state')}`
        )
        expect(real.status).toBe(200)
      }
    })
    expect(grant).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 3_600_000 })
    const body = new URLSearchParams(String(tokenFetch.mock.calls[0]?.[1]?.body))
    expect(body.get('code')).toBe('good')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(pkceChallengeFor(body.get('code_verifier') ?? '')).toBe(challenge)
  })

  it('rejects when the user cancels in the browser', async () => {
    await expect(
      runLoopbackSignIn(config, {
        fetchImpl: vi.fn(),
        openBrowser: async (authorizeUrl: string) => {
          const url = new URL(authorizeUrl)
          const port = new URL(url.searchParams.get('redirect_uri') ?? '').port
          await fetch(
            `http://127.0.0.1:${port}/?error=access_denied&state=${url.searchParams.get('state')}`
          )
        }
      })
    ).rejects.toMatchObject({ code: 'access_denied' })
  })
})
