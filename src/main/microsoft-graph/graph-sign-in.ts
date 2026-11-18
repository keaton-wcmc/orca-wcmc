import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { MicrosoftGraphConfig } from './microsoft-graph-config'
import {
  buildAuthorizeUrl,
  createPkcePair,
  GraphTokenError,
  requestGraphToken,
  type GraphTokenGrant
} from './graph-pkce'

const SIGN_IN_TIMEOUT_MS = 5 * 60_000

const PAGE = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>Orca</title><body style="font-family:system-ui;padding:3rem">${message}</body>`

export type LoopbackSignInDeps = {
  openBrowser: (url: string) => unknown
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      const address: AddressInfo | string | null = server.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    })
  })
}

/** Browser sign-in with PKCE; loopback only, one callback, then the listeners close. */
export async function runLoopbackSignIn(
  config: MicrosoftGraphConfig,
  deps: LoopbackSignInDeps
): Promise<GraphTokenGrant> {
  const { verifier, challenge } = createPkcePair()
  const state = randomBytes(16).toString('hex')
  let settle: { resolve: (code: string) => void; reject: (error: Error) => void } | null = null
  const codePromise = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject }
  })

  const handle = (request: IncomingMessage, response: ServerResponse): void => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== '/') {
      response.writeHead(404).end()
      return
    }
    const error = url.searchParams.get('error')
    if (url.searchParams.get('state') !== state) {
      response
        .writeHead(400, { 'content-type': 'text/html' })
        .end(PAGE('Sign-in state did not match.'))
      return
    }
    if (error) {
      response
        .writeHead(400, { 'content-type': 'text/html' })
        .end(PAGE('Microsoft sign-in was not completed. You can close this tab.'))
      settle?.reject(new GraphTokenError(error, url.searchParams.get('error_description') ?? ''))
      return
    }
    const code = url.searchParams.get('code')
    if (!code) {
      response.writeHead(400).end()
      return
    }
    response
      .writeHead(200, { 'content-type': 'text/html' })
      .end(PAGE('Orca is connected to Microsoft. You can close this tab.'))
    settle?.resolve(code)
  }

  // Browsers may resolve localhost to either loopback family, so listen on both.
  const v4 = createServer(handle)
  const v6 = createServer(handle)
  const port = await listen(v4, '127.0.0.1', 0)
  await listen(v6, '::1', port).catch(() => undefined)
  const redirectUri = `http://localhost:${port}`
  const timer = setTimeout(
    () => settle?.reject(new GraphTokenError('timeout', 'Microsoft sign-in timed out')),
    deps.timeoutMs ?? SIGN_IN_TIMEOUT_MS
  )
  try {
    await deps.openBrowser(buildAuthorizeUrl(config, redirectUri, challenge, state))
    const code = await codePromise
    return await requestGraphToken(
      config,
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier
      },
      (deps.now ?? Date.now)(),
      deps.fetchImpl
    )
  } finally {
    clearTimeout(timer)
    v4.close()
    v6.close()
  }
}
