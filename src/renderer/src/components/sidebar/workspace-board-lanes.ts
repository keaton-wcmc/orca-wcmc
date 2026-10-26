import type { WorkspaceBoardColumns } from '../../../../shared/workspace-board-columns'
import {
  WORKSPACE_PRIORITY_LANES,
  getWorkspacePriority,
  getWorkspacePriorityFromGroupKey,
  getWorkspacePriorityGroupKey
} from '../../../../shared/workspace-priority'
import type { WorktreeMeta } from '../../../../shared/worktree/meta-types'
import type { WorkspaceStatusDefinition, Worktree } from '../../../../shared/worktree/types'
import { getWorkspacePriorityLabel, getWorkspacePriorityLaneIcon } from '../workspace-priority-icon'
import { getWorkspaceStatus, getWorkspaceStatusVisualMeta } from './workspace-status'

// Why: a lane id names its own axis (priority ids carry the priority group prefix), so drop
// writers know what a drop changes without being told which columns the board shows.

export function getWorkspaceBoardLanes(
  columns: WorkspaceBoardColumns,
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
): readonly WorkspaceStatusDefinition[] {
  if (columns === 'status') {
    return workspaceStatuses
  }
  return WORKSPACE_PRIORITY_LANES.map((priority) => ({
    id: getWorkspacePriorityGroupKey(priority),
    label: getWorkspacePriorityLabel(priority),
    color: priority === 'urgent' ? 'rose' : 'neutral'
  }))
}

export function getWorkspaceBoardLaneIds(
  columns: WorkspaceBoardColumns,
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
): string[] {
  return columns === 'priority'
    ? WORKSPACE_PRIORITY_LANES.map(getWorkspacePriorityGroupKey)
    : workspaceStatuses.map((status) => status.id)
}

export function getWorkspaceBoardLaneKey(
  row: Worktree,
  columns: WorkspaceBoardColumns,
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
): string {
  return columns === 'priority'
    ? getWorkspacePriorityGroupKey(getWorkspacePriority(row))
    : getWorkspaceStatus(row, workspaceStatuses)
}

export function isWorkspaceBoardStatusLane(laneKey: string): boolean {
  return getWorkspacePriorityFromGroupKey(laneKey) === undefined
}

/** The lane `row` sits in on the same axis as `laneKey`. */
export function getWorkspaceBoardRowLaneKey(
  row: Worktree,
  laneKey: string,
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
): string {
  return getWorkspaceBoardLaneKey(
    row,
    isWorkspaceBoardStatusLane(laneKey) ? 'status' : 'priority',
    workspaceStatuses
  )
}

/** The write that moves `row` into `laneKey`; empty when it is already there. */
export function getWorkspaceBoardLaneUpdate(
  row: Worktree,
  laneKey: string,
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
): Partial<WorktreeMeta> {
  const priority = getWorkspacePriorityFromGroupKey(laneKey)
  if (priority !== undefined) {
    return getWorkspacePriority(row) === priority ? {} : { priority }
  }
  return getWorkspaceStatus(row, workspaceStatuses) === laneKey ? {} : { workspaceStatus: laneKey }
}

export function getWorkspaceBoardLaneVisualMeta(
  lane: WorkspaceStatusDefinition
): ReturnType<typeof getWorkspaceStatusVisualMeta> {
  const meta = getWorkspaceStatusVisualMeta(lane)
  const priority = getWorkspacePriorityFromGroupKey(lane.id)
  return priority === undefined
    ? meta
    : { ...meta, icon: getWorkspacePriorityLaneIcon(priority), tone: 'text-foreground' }
}
