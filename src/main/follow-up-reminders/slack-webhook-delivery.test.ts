import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { postSlackWebhook } from './slack-webhook-delivery'
import { SlackWebhookSecret, type SecretCipher } from './slack-webhook-secret'

vi.mock('electron', () => ({ safeStorage: {} }))

const url = 'https://hooks.slack.com/services/T000/B000/secretpart'
const noSleep = async () => {}

function responses(...statuses: number[]): typeof fetch {
  const queue = [...statuses]
  return vi.fn(async () => new Response(null, { status: queue.shift() ?? 200 }))
}

describe('postSlackWebhook', () => {
  it('retries server errors and succeeds on the third attempt', async () => {
    const fetchImpl = responses(500, 500, 200)
    await expect(postSlackWebhook(url, 'hi', fetchImpl, noSleep)).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('gives up after three attempts without leaking the URL', async () => {
    const fetchImpl = responses(500, 500, 500, 500)
    const result = await postSlackWebhook(url, 'hi', fetchImpl, noSleep)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ ok: false, error: 'Slack webhook returned HTTP 500' })
    expect(result.error).not.toContain('secretpart')
  })

  it('does not retry a client error', async () => {
    const fetchImpl = responses(404)
    await expect(postSlackWebhook(url, 'hi', fetchImpl, noSleep)).resolves.toMatchObject({
      ok: false
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('SlackWebhookSecret', () => {
  const flip = (bytes: Uint8Array) => Buffer.from(bytes.map((byte) => byte ^ 0x5a))
  const xorCipher: SecretCipher = {
    isEncryptionAvailable: () => true,
    encryptString: (text) => flip(Buffer.from(text)),
    decryptString: (cipher) => flip(cipher).toString()
  }

  it('stores the URL sealed and reads it back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slack-secret-'))
    try {
      const filePath = join(dir, 'webhook.enc')
      const secret = new SlackWebhookSecret(filePath, xorCipher)
      secret.write(url)
      expect(readFileSync(filePath, 'utf8')).not.toContain('secretpart')
      expect(secret.read()).toBe(url)
      expect(secret.status()).toEqual({ configured: true, encryptionAvailable: true })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects a URL that is not a Slack webhook, and refuses without a keychain', () => {
    expect(() => new SlackWebhookSecret('/unused', xorCipher).write('http://example.com')).toThrow()
    const noKeychain = { ...xorCipher, isEncryptionAvailable: () => false }
    expect(() => new SlackWebhookSecret('/unused', noKeychain).write(url)).toThrow(/keychain/)
  })
})
