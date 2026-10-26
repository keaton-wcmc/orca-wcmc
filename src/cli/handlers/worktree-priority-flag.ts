import { getOptionalStringFlag } from '../flags'
import { RuntimeClientError, type RuntimeClient } from '../runtime-client'
import type { RuntimeStatus } from '../../shared/runtime-types'
import {
  WORKSPACE_PRIORITIES,
  isWorkspacePriority,
  type WorkspacePriority
} from '../../shared/workspace-priority'
import { WORKTREE_PRIORITY_RUNTIME_CAPABILITY } from '../../shared/worktree-runtime-capabilities'

/** `--priority` as `worktree.set`'s `priority`: `none` clears it; absent leaves it unchanged. */
export function getOptionalWorktreePriorityFlag(
  flags: Map<string, string | boolean>
): WorkspacePriority | null | undefined {
  const value = getOptionalStringFlag(flags, 'priority')?.trim().toLowerCase()
  if (value === undefined) {
    return undefined
  }
  if (value === 'none') {
    return null
  }
  if (isWorkspacePriority(value)) {
    return value
  }
  throw new RuntimeClientError(
    'invalid_argument',
    `--priority must be one of: ${[...WORKSPACE_PRIORITIES, 'none'].join(', ')}.`
  )
}

// Why: an older runtime strips the field and would report the update as applied.
export async function assertWorktreePrioritySupported(
  client: RuntimeClient,
  priority: WorkspacePriority | null | undefined
): Promise<void> {
  if (priority === undefined) {
    return
  }
  const status = await client.call<RuntimeStatus>('status.get')
  if (!status.result.capabilities?.includes(WORKTREE_PRIORITY_RUNTIME_CAPABILITY)) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      'Update the Orca runtime to set workspace priority.'
    )
  }
}
