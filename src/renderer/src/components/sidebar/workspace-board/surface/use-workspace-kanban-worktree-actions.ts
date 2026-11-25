import {
  getWorkspaceBoardLaneUpdate,
  getWorkspaceBoardRowLaneKey,
  isWorkspaceBoardStatusLane
} from '../projection/workspace-board-lanes'
import { useCallback } from 'react'
import { useAppStore } from '@/store'
import '../../workspace-status/presentation/workspace-status'
import { switchSortToManualAfterDrop } from '../../worktree-list/listing/manual-sort-switch-toast'
import { resolveFullLaneDropIndex } from '../drag/workspace-kanban-filtered-drop-index'
import {
  buildManualOrderUpdatesForGroupDrop,
  shouldWriteManualOrderForGroupDrop,
  type WorktreeDragGroup
} from '../../worktree-list/drag/worktree-manual-order'
import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition,
  Worktree
} from '../../../../../../shared/worktree/types'
import type { WorktreeMetaBatchUpdate } from '../../../../store/slices/worktrees/metadata/worktree-meta-update-options'
import type { WorktreeManualOrderCatalog } from '../../worktree-list/drag/worktree-manual-order-catalog'
import { isWorkspaceStatusAllowedOnHost } from '@/store/workspaces/status/host-workspace-status-columns'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'

type LaneView = { items: readonly Worktree[] }

export function useWorkspaceKanbanWorktreeActions(args: {
  boardDragGroups: readonly WorktreeDragGroup[]
  laneFullWorktreeIds: ReadonlyMap<string, readonly string[]>
  laneViews: ReadonlyMap<string, LaneView>
  /** Host identities of the cards whose status changed. */
  maybeSyncTaskStatuses: (worktreeKeys: readonly string[], status: WorkspaceStatus) => void
  sortBy: ReturnType<typeof useAppStore.getState>['sortBy']
  updateWorktreeMeta: ReturnType<typeof useAppStore.getState>['updateWorktreeMeta']
  updateWorktreesMeta: ReturnType<typeof useAppStore.getState>['updateWorktreesMeta']
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  worktreeById: ReadonlyMap<string, Worktree>
  /** Every card by host identity; lanes, drops and manual ranks use these keys. */
  worktreeByKey: ReadonlyMap<string, Worktree>
  manualOrderCatalog: WorktreeManualOrderCatalog
  worktreesByStatus: ReadonlyMap<string, readonly Worktree[]>
}) {
  const recordInteraction = (): void => {
    useAppStore.getState().recordFeatureInteraction('workspace-board-actions')
  }
  const getSourceLaneKeys = useCallback(
    (worktreeKeys: readonly string[], laneKey: WorkspaceStatus): WorkspaceStatus[] =>
      worktreeKeys.flatMap((key) => {
        const worktree = args.worktreeByKey.get(key)
        return worktree
          ? [getWorkspaceBoardRowLaneKey(worktree, laneKey, args.workspaceStatuses)]
          : []
      }),
    [args.workspaceStatuses, args.worktreeByKey]
  )
  const shouldWriteDropManualOrder = useCallback(
    (worktreeKeys: readonly string[], status: WorkspaceStatus): boolean =>
      shouldWriteManualOrderForGroupDrop({
        sortBy: args.sortBy,
        sourceGroupKeys: getSourceLaneKeys(worktreeKeys, status),
        targetGroupKey: status
      }),
    [args.sortBy, getSourceLaneKeys]
  )
  // Why: issue sync maps board statuses to tracker states; a priority lane has no such state.
  const maybeSyncTaskStatuses = useCallback(
    (worktreeIds: readonly string[], laneKey: WorkspaceStatus): void => {
      if (isWorkspaceBoardStatusLane(laneKey)) {
        args.maybeSyncTaskStatuses(worktreeIds, laneKey)
      }
    },
    [args]
  )
  const moveWorktreeToStatus = useCallback(
    (worktreeId: string, status: WorkspaceStatus) => {
      const current = args.worktreeById.get(worktreeId)
      const updates = current
        ? getWorkspaceBoardLaneUpdate(current, status, args.workspaceStatuses)
        : {}
      if (!current || Object.keys(updates).length === 0) {
        return
      }
      recordInteraction()
      void args.updateWorktreeMeta(worktreeId, updates, {
        executionHostId: current.hostId ?? 'local'
      })
      maybeSyncTaskStatuses([getWorktreeHostIdentity(current)], status)
    },
    [args, maybeSyncTaskStatuses]
  )
  const moveWorktreesToStatus = useCallback(
    (worktreeIds: readonly string[], status: WorkspaceStatus) => {
      const updates: WorktreeMetaBatchUpdate[] = []
      const changedKeys: string[] = []
      for (const worktreeId of worktreeIds) {
        const current = args.worktreeById.get(worktreeId)
        const laneUpdate = current
          ? getWorkspaceBoardLaneUpdate(current, status, args.workspaceStatuses)
          : {}
        if (!current || Object.keys(laneUpdate).length === 0) {
          continue
        }
        changedKeys.push(getWorktreeHostIdentity(current))
        updates.push({
          worktreeId,
          updates: laneUpdate,
          executionHostId: current.hostId ?? 'local'
        })
      }
      if (changedKeys.length === 0) {
        return
      }
      recordInteraction()
      void args.updateWorktreesMeta(updates)
      maybeSyncTaskStatuses(changedKeys, status)
    },
    [args, maybeSyncTaskStatuses]
  )
  const dropWorktreesInStatus = useCallback(
    (drop: {
      worktreeKeys: readonly string[]
      status: WorkspaceStatus
      dropIndex: number
      writeManualOrder?: boolean
    }) => {
      // Cards that can't take this status (another paired host's column) aren't re-ranked either.
      const state = useAppStore.getState()
      const rows = drop.worktreeKeys.flatMap((key) => {
        const current = args.worktreeByKey.get(key)
        return current && isWorkspaceStatusAllowedOnHost(state, current, drop.status)
          ? [current]
          : []
      })
      if (rows.length === 0) {
        return
      }
      const worktreeKeys = rows.map(getWorktreeHostIdentity)
      const writeManualOrder =
        drop.writeManualOrder ?? shouldWriteDropManualOrder(worktreeKeys, drop.status)
      const order = writeManualOrder
        ? buildManualOrderUpdatesForGroupDrop({
            groups: args.boardDragGroups,
            targetGroupKey: drop.status,
            draggedIds: worktreeKeys,
            dropIndex: drop.dropIndex,
            now: Date.now(),
            rankByWorktreeId: args.manualOrderCatalog.rankByKey,
            allWorktreeIds: args.manualOrderCatalog.orderedKeys
          })
        : { changed: false, updates: new Map<string, { manualOrder: number }>() }
      const updatesByKey = new Map<string, WorktreeMetaBatchUpdate>()
      for (const current of rows) {
        updatesByKey.set(getWorktreeHostIdentity(current), {
          worktreeId: current.id,
          updates: getWorkspaceBoardLaneUpdate(current, drop.status, args.workspaceStatuses),
          executionHostId: current.hostId ?? 'local'
        })
      }
      for (const [key, manualOrder] of order.updates) {
        const entry = updatesByKey.get(key)
        if (entry) {
          entry.updates = { ...entry.updates, ...manualOrder }
          continue
        }
        const current = args.worktreeByKey.get(key)
        if (current) {
          updatesByKey.set(key, {
            worktreeId: current.id,
            updates: manualOrder,
            executionHostId: current.hostId ?? 'local'
          })
        }
      }
      const changed = [...updatesByKey.values()].filter(
        (entry) => Object.keys(entry.updates).length > 0
      )
      if (changed.length === 0) {
        return
      }
      if (writeManualOrder && order.changed) {
        switchSortToManualAfterDrop()
      }
      recordInteraction()
      void args.updateWorktreesMeta(changed)
      maybeSyncTaskStatuses(worktreeKeys, drop.status)
    },
    [args, maybeSyncTaskStatuses, shouldWriteDropManualOrder]
  )
  const dropPointerDraggedWorktreesInStatus = useCallback(
    (drop: { worktreeKeys: readonly string[]; status: WorkspaceStatus; dropIndex: number }) => {
      dropWorktreesInStatus({
        ...drop,
        dropIndex: resolveFullLaneDropIndex({
          fullLaneIds: args.laneFullWorktreeIds.get(drop.status) ?? [],
          renderedIds: (args.laneViews.get(drop.status)?.items ?? []).map(getWorktreeHostIdentity),
          filteredDropIndex: drop.dropIndex
        })
      })
    },
    [args.laneFullWorktreeIds, args.laneViews, dropWorktreesInStatus]
  )
  const dropWorktreesAtEndOfStatus = useCallback(
    (worktreeIds: readonly string[], status: WorkspaceStatus) => {
      // These drops carry bare ids, so only an id one host owns can name its card.
      const worktreeKeys = worktreeIds.flatMap((worktreeId) => {
        const current = args.worktreeById.get(worktreeId)
        return current ? [getWorktreeHostIdentity(current)] : []
      })
      dropWorktreesInStatus({
        worktreeKeys,
        status,
        dropIndex: args.worktreesByStatus.get(status)?.length ?? 0,
        writeManualOrder: args.sortBy === 'manual'
      })
    },
    [args.sortBy, args.worktreeById, args.worktreesByStatus, dropWorktreesInStatus]
  )
  const pinWorktree = useCallback(
    (worktreeId: string) => {
      const current = args.worktreeById.get(worktreeId)
      if (!current || current.isPinned) {
        return
      }
      void args.updateWorktreeMeta(
        worktreeId,
        { isPinned: true },
        { executionHostId: current.hostId ?? 'local' }
      )
    },
    [args]
  )
  const pinWorktrees = useCallback(
    (worktreeIds: readonly string[]) => {
      const updates: WorktreeMetaBatchUpdate[] = []
      for (const worktreeId of worktreeIds) {
        const current = args.worktreeById.get(worktreeId)
        if (current && !current.isPinned) {
          updates.push({
            worktreeId,
            updates: { isPinned: true },
            executionHostId: current.hostId ?? 'local'
          })
        }
      }
      if (updates.length > 0) {
        recordInteraction()
        void args.updateWorktreesMeta(updates)
      }
    },
    [args]
  )
  return {
    dropPointerDraggedWorktreesInStatus,
    dropWorktreesAtEndOfStatus,
    moveWorktreeToStatus,
    moveWorktreesToStatus,
    pinWorktree,
    pinWorktrees,
    shouldWriteDropManualOrder
  }
}
