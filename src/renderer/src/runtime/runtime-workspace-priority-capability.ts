import type { WorkspacePriority } from '../../../shared/workspace-priority'
import { WORKTREE_PRIORITY_RUNTIME_CAPABILITY } from '../../../shared/remote-runtime/protocol/worktree-runtime-capabilities'
import { assertRuntimeEnvironmentCapability } from './rpc/compatibility/runtime-capability-proof'
import type { RuntimeClientTarget } from '../../../shared/remote-runtime/host-catalog/runtime-client-target'
import { translate } from '@/i18n/i18n'

/** Refuses a priority write (a clear included) that an older remote host would silently drop.
 *  Callers await only when a priority is being written, so other updates gain no async tick. */
export async function assertPriorityWriteSupported(
  target: RuntimeClientTarget,
  updates: { priority?: WorkspacePriority | null }
): Promise<void> {
  if (target.kind !== 'environment' || updates.priority === undefined) {
    return
  }
  await assertRuntimeEnvironmentCapability(
    target.environmentId,
    WORKTREE_PRIORITY_RUNTIME_CAPABILITY,
    translate(
      'auto.store.folder.workspaces.priority.capability',
      'Update the remote runtime to set workspace priority'
    )
  )
}
