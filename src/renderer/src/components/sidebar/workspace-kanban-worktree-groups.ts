import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition,
  Worktree
} from '../../../../shared/worktree/types'
import type { SortBy } from '../../../../shared/sidebar-list/smart-sort'
import type { WorkspaceBoardColumns } from '../../../../shared/workspace-board-columns'
import { compareWorkspacePriority } from '../../../../shared/workspace-priority'
import { compareWorktreeDisplayName } from '@/lib/worktree-display-name-order'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { getWorkspaceBoardLaneIds, getWorkspaceBoardLaneKey } from './workspace-board-lanes'

function sortBoardWorktrees(a: Worktree, b: Worktree): number {
  return (
    Number(b.isPinned) - Number(a.isPinned) ||
    compareWorkspacePriority(a, b) ||
    b.lastActivityAt - a.lastActivityAt ||
    compareWorktreeDisplayName(a, b)
  )
}

function sortManualBoardWorktrees(a: Worktree, b: Worktree): number {
  return (
    (b.manualOrder ?? b.sortOrder) - (a.manualOrder ?? a.sortOrder) ||
    compareWorktreeDisplayName(a, b)
  )
}

export function groupWorkspaceKanbanWorktrees(params: {
  worktrees: readonly Worktree[]
  visibleWorktreeIds: ReadonlySet<string>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  columns: WorkspaceBoardColumns
  sortBy: SortBy
}): Map<WorkspaceStatus, Worktree[]> {
  const { worktrees, visibleWorktreeIds, workspaceStatuses, columns, sortBy } = params
  const grouped = new Map<WorkspaceStatus, Worktree[]>(
    getWorkspaceBoardLaneIds(columns, workspaceStatuses).map((laneId) => [laneId, []])
  )

  for (const worktree of worktrees) {
    if (!visibleWorktreeIds.has(getWorktreeHostIdentity(worktree))) {
      continue
    }
    grouped.get(getWorkspaceBoardLaneKey(worktree, columns, workspaceStatuses))!.push(worktree)
  }

  for (const items of grouped.values()) {
    items.sort(sortBy === 'manual' ? sortManualBoardWorktrees : sortBoardWorktrees)
  }
  return grouped
}
