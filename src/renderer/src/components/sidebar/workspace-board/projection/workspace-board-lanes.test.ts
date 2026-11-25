import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { cloneDefaultWorkspaceStatuses } from '../../../../../../shared/workspace/status/workspace-statuses'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getWorkspacePriorityGroupKey } from '../../../../../../shared/workspace-priority'
import { getWorkspaceBoardLaneUpdate, getWorkspaceBoardLaneIds } from './workspace-board-lanes'
import { groupWorkspaceKanbanWorktrees } from './workspace-kanban-worktree-groups'

const statuses = cloneDefaultWorkspaceStatuses()

function worktree(overrides: Partial<Worktree> & Pick<Worktree, 'id'>): Worktree {
  return {
    repoId: 'repo',
    path: `/tmp/${overrides.id}`,
    branch: `refs/heads/${overrides.id}`,
    head: 'abc',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    comment: '',
    isUnread: false,
    isPinned: false,
    displayName: overrides.id,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

describe('workspace board columns', () => {
  it('writes priority, never status, for a drop on a Priority column', () => {
    const row = worktree({ id: 'a', priority: 'low' })
    expect(
      getWorkspaceBoardLaneUpdate(row, getWorkspacePriorityGroupKey('urgent'), statuses)
    ).toEqual({ priority: 'urgent' })
    expect(getWorkspaceBoardLaneUpdate(row, getWorkspacePriorityGroupKey(null), statuses)).toEqual({
      priority: null
    })
    expect(getWorkspaceBoardLaneUpdate(row, getWorkspacePriorityGroupKey('low'), statuses)).toEqual(
      {}
    )
  })

  it('ranks pinned, then priority, then recency, and lays Priority columns urgent first', () => {
    const worktrees = [
      worktree({ id: 'recent', lastActivityAt: 90 }),
      worktree({ id: 'low', priority: 'low', lastActivityAt: 99 }),
      worktree({ id: 'urgent', priority: 'urgent', lastActivityAt: 1 }),
      worktree({ id: 'pinned', isPinned: true })
    ]
    const group = (columns: 'status' | 'priority') =>
      groupWorkspaceKanbanWorktrees({
        worktrees,
        visibleWorktreeIds: new Set(worktrees.map(getWorktreeHostIdentity)),
        workspaceStatuses: statuses,
        columns,
        sortBy: 'recent'
      })
    const everyone = (grouped: ReturnType<typeof group>) =>
      [...grouped.values()].flat().map((item) => item.id)

    const byPriority = group('priority')
    expect([...byPriority.keys()]).toEqual(getWorkspaceBoardLaneIds('priority', statuses))
    expect(everyone(byPriority)).toEqual(['urgent', 'low', 'pinned', 'recent'])
  })
})
