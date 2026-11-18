import { z } from 'zod'
import { SealedJsonFile, type SecretCipher } from '../microsoft-graph/sealed-json-file'

const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/'

export type { SecretCipher }

export type SlackWebhookStatus = {
  configured: boolean
  encryptionAvailable: boolean
  lastError?: string
}

/** The follow-up Slack webhook URL, sealed by the OS keychain; never stored in plaintext. */
export class SlackWebhookSecret {
  private readonly file: SealedJsonFile<string>
  private lastError: string | undefined

  constructor(filePath: string, cipher?: SecretCipher) {
    this.file = new SealedJsonFile(filePath, z.string(), 'Slack webhook', cipher)
  }

  read(): string | null {
    return this.file.read()
  }

  write(url: string): void {
    if (!url.startsWith(SLACK_WEBHOOK_PREFIX)) {
      throw new Error(`A Slack incoming webhook URL starts with ${SLACK_WEBHOOK_PREFIX}`)
    }
    this.file.write(url)
    this.lastError = undefined
  }

  clear(): void {
    this.file.clear()
    this.lastError = undefined
  }

  recordError(message: string | null): void {
    this.lastError = message ?? undefined
  }

  status(): SlackWebhookStatus {
    return {
      configured: this.file.exists(),
      encryptionAvailable: this.file.encryptionAvailable(),
      ...(this.lastError ? { lastError: this.lastError } : {})
    }
  }
}
