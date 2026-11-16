import { existsSync, readFileSync, rmSync } from 'node:fs'
import { guardedSafeStorage } from '../host/safe-storage-availability'
import { writeSecureFile } from '../../shared/secure-file'

const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/'

export type SlackWebhookStatus = {
  configured: boolean
  encryptionAvailable: boolean
  lastError?: string
}

export type SecretCipher = Pick<
  typeof guardedSafeStorage,
  'isEncryptionAvailable' | 'encryptString' | 'decryptString'
>

/** The follow-up Slack webhook URL, sealed by the OS keychain; never stored in plaintext. */
export class SlackWebhookSecret {
  private readonly filePath: string
  private readonly cipher: SecretCipher
  private lastError: string | undefined

  constructor(filePath: string, cipher: SecretCipher = guardedSafeStorage) {
    this.filePath = filePath
    this.cipher = cipher
  }

  read(): string | null {
    if (!existsSync(this.filePath) || !this.cipher.isEncryptionAvailable()) {
      return null
    }
    try {
      return this.cipher.decryptString(Buffer.from(readFileSync(this.filePath, 'utf8'), 'base64'))
    } catch {
      return null
    }
  }

  write(url: string): void {
    if (!url.startsWith(SLACK_WEBHOOK_PREFIX)) {
      throw new Error(`A Slack incoming webhook URL starts with ${SLACK_WEBHOOK_PREFIX}`)
    }
    if (!this.cipher.isEncryptionAvailable()) {
      throw new Error('The OS keychain is unavailable, so the Slack webhook cannot be stored')
    }
    writeSecureFile(this.filePath, this.cipher.encryptString(url).toString('base64'))
    this.lastError = undefined
  }

  clear(): void {
    rmSync(this.filePath, { force: true })
    this.lastError = undefined
  }

  recordError(message: string | null): void {
    this.lastError = message ?? undefined
  }

  status(): SlackWebhookStatus {
    return {
      configured: existsSync(this.filePath),
      encryptionAvailable: this.cipher.isEncryptionAvailable(),
      ...(this.lastError ? { lastError: this.lastError } : {})
    }
  }
}
