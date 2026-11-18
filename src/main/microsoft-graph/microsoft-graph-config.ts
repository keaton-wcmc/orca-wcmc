import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import { writeSecureJsonFile } from '../../shared/secure-file'

const guid = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Expected a GUID')

export const microsoftGraphConfigSchema = z.object({ clientId: guid, tenantId: guid })
export type MicrosoftGraphConfig = z.infer<typeof microsoftGraphConfigSchema>

/** The user's own Entra app ids; not secrets, so plain JSON. */
export class MicrosoftGraphConfigFile {
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  read(): MicrosoftGraphConfig | null {
    if (!existsSync(this.filePath)) {
      return null
    }
    try {
      const parsed = microsoftGraphConfigSchema.safeParse(
        JSON.parse(readFileSync(this.filePath, 'utf8'))
      )
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  write(config: MicrosoftGraphConfig): MicrosoftGraphConfig {
    const valid = microsoftGraphConfigSchema.parse(config)
    writeSecureJsonFile(this.filePath, valid)
    return valid
  }
}
