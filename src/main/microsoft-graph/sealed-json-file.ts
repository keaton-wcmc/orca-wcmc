import { existsSync, readFileSync, rmSync } from 'node:fs'
import type { ZodType } from 'zod'
import { guardedSafeStorage } from '../host/safe-storage-availability'
import { writeSecureFile } from '../../shared/secure-file'

export type SecretCipher = Pick<
  typeof guardedSafeStorage,
  'isEncryptionAvailable' | 'encryptString' | 'decryptString'
>

export class KeychainUnavailableError extends Error {
  constructor(what: string) {
    super(`The OS keychain is unavailable, so the ${what} cannot be stored`)
    this.name = 'KeychainUnavailableError'
  }
}

/** A JSON value sealed by the OS keychain; never written in plaintext. */
export class SealedJsonFile<T> {
  private readonly filePath: string
  private readonly schema: ZodType<T>
  private readonly what: string
  private readonly cipher: SecretCipher

  constructor(
    filePath: string,
    schema: ZodType<T>,
    what: string,
    cipher: SecretCipher = guardedSafeStorage
  ) {
    this.filePath = filePath
    this.schema = schema
    this.what = what
    this.cipher = cipher
  }

  exists(): boolean {
    return existsSync(this.filePath)
  }

  encryptionAvailable(): boolean {
    return this.cipher.isEncryptionAvailable()
  }

  read(): T | null {
    if (!this.exists() || !this.cipher.isEncryptionAvailable()) {
      return null
    }
    try {
      const plain = this.cipher.decryptString(
        Buffer.from(readFileSync(this.filePath, 'utf8'), 'base64')
      )
      const parsed = this.schema.safeParse(JSON.parse(plain))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  write(value: T): void {
    if (!this.cipher.isEncryptionAvailable()) {
      throw new KeychainUnavailableError(this.what)
    }
    const sealed = this.cipher.encryptString(JSON.stringify(this.schema.parse(value)))
    writeSecureFile(this.filePath, sealed.toString('base64'))
  }

  clear(): void {
    rmSync(this.filePath, { force: true })
  }
}
