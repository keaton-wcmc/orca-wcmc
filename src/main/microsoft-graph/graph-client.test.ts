import { describe, expect, it, vi } from 'vitest'
import { GraphClient, GraphRequestError, graphUtcToIso } from './graph-client'

function sequence(...responses: Response[]) {
  const queue = [...responses]
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = queue.shift()
    if (!next) {
      throw new Error('unexpected request')
    }
    return next
  })
}

describe('GraphClient', () => {
  it('refreshes the token once on 401 and retries', async () => {
    const getAccessToken = vi.fn(async (force?: boolean) => (force ? 'fresh' : 'stale'))
    const fetchImpl = sequence(
      new Response(null, { status: 401 }),
      Response.json({ userPrincipalName: 'keaton@example.org' })
    )
    const client = new GraphClient({ getAccessToken }, fetchImpl)
    await expect(client.me()).resolves.toBe('keaton@example.org')
    expect(getAccessToken).toHaveBeenLastCalledWith(true)
    const headers = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer fresh')
    expect(headers.get('prefer')).toBe('outlook.timezone="UTC"')
  })

  it('waits Retry-After seconds on 429', async () => {
    const sleep = vi.fn(async () => {})
    const fetchImpl = sequence(
      new Response(null, { status: 429, headers: { 'retry-after': '7' } }),
      Response.json({ timeZone: 'GMT Standard Time' })
    )
    const client = new GraphClient({ getAccessToken: async () => 't' }, fetchImpl, sleep)
    await expect(client.mailboxSettings()).resolves.toMatchObject({ timeZone: 'GMT Standard Time' })
    expect(sleep).toHaveBeenCalledWith(7000)
  })

  it('follows nextLink pages and surfaces Graph error messages', async () => {
    const fetchImpl = sequence(
      Response.json({
        value: [{ id: 'a', displayName: 'Tasks' }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/todo/lists?$skip=1'
      }),
      Response.json({ value: [{ id: 'b', displayName: 'Orca' }] }),
      Response.json({ error: { message: 'Insufficient privileges' } }, { status: 403 })
    )
    const client = new GraphClient({ getAccessToken: async () => 't' }, fetchImpl)
    await expect(client.todoLists()).resolves.toEqual([
      { id: 'a', displayName: 'Tasks' },
      { id: 'b', displayName: 'Orca' }
    ])
    await expect(client.createTodoList('x')).rejects.toEqual(
      new GraphRequestError(403, 'Insufficient privileges')
    )
  })

  it('reads Graph UTC times without an offset as UTC', () => {
    expect(graphUtcToIso({ dateTime: '2026-11-18T09:00:00.0000000' })).toBe(
      '2026-11-18T09:00:00.000Z'
    )
  })
})
