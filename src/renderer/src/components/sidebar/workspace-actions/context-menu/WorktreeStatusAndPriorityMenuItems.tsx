import { WorktreeStatusMenuItems } from '../../workspace-status/presentation/WorktreeStatusMenuItems'
import type { WorktreeContextMenuModel } from './use-worktree-context-menu-model'
import { WorktreePriorityMenuItems } from './WorktreePriorityMenuItems'

export function WorktreeStatusAndPriorityMenuItems({
  model
}: {
  model: WorktreeContextMenuModel
}): React.JSX.Element {
  return (
    <>
      <WorktreeStatusMenuItems
        contextWorkspaceStatus={model.contextWorkspaceStatus}
        deletingContext={model.deletingContext}
        isMultiContext={model.isMultiContext}
        onAssignWorkspaceStatus={model.handleAssignWorkspaceStatus}
        workspaceStatuses={model.workspaceStatuses}
      />
      <WorktreePriorityMenuItems
        worktrees={model.activeContextWorktrees}
        deletingContext={model.deletingContext}
        isMultiContext={model.isMultiContext}
        onAssignPriority={model.handleAssignPriority}
      />
    </>
  )
}
