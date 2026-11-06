import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import { getWorkspaceAttachments } from '../../../../shared/workspace-attachments/workspace-attachments'
import type { FolderWorkspaceUpdates } from '../repos/repo-state'

/** Stamps the attachment set the edit started from, so the owner can merge a concurrent edit. */
export function withLinkedItemsBase(
  updates: FolderWorkspaceUpdates,
  sourceWorkspace: FolderWorkspace | undefined
): FolderWorkspaceUpdates {
  if (
    updates.linkedItems === undefined ||
    updates.linkedItemsBase !== undefined ||
    !sourceWorkspace
  ) {
    return updates
  }
  return {
    ...updates,
    linkedItemsBase: getWorkspaceAttachments({
      linkedItems: sourceWorkspace.linkedItems,
      linkedWorkItem: sourceWorkspace.linkedTask,
      linkedTaskSourceContext: sourceWorkspace.linkedTaskSourceContext
    })
  }
}
