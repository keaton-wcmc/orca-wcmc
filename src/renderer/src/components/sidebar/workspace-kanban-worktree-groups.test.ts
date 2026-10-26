import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { groupWorkspaceKanbanWorktrees } from './workspace-kanban-worktree-groups'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { getWorkspacePriorityGroupKey } from '../../../../shared/workspace-priority'

function worktree({
  id,
  displayName,
  ...overrides
}: Partial<Worktree> & Pick<Worktree, 'id' | 'displayName'>): Worktree {
  return {
    repoId: 'repo',
    path: `/tmp/${id}`,
    head: 'head',
    branch: displayName,
    isBare: false,
    isMainWorktree: false,
    id,
    displayName,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  } as Worktree
}

const statuses = [
  { id: 'todo', label: 'Todo' },
  { id: 'doing', label: 'Doing' }
]

function visibleIdentities(worktrees: readonly Worktree[]): Set<string> {
  return new Set(worktrees.map(getWorktreeHostIdentity))
}

describe('groupWorkspaceKanbanWorktrees', () => {
  it('uses manualOrder inside lanes when Manual sort is active', () => {
    const worktrees = [
      worktree({
        id: 'a',
        displayName: 'A',
        workspaceStatus: 'doing',
        manualOrder: 100,
        lastActivityAt: 10
      }),
      worktree({
        id: 'b',
        displayName: 'B',
        workspaceStatus: 'doing',
        manualOrder: 300,
        lastActivityAt: 1
      }),
      worktree({
        id: 'c',
        displayName: 'C',
        workspaceStatus: 'doing',
        manualOrder: 200,
        lastActivityAt: 50
      })
    ]
    const grouped = groupWorkspaceKanbanWorktrees({
      worktrees,
      visibleWorktreeIds: visibleIdentities(worktrees),
      workspaceStatuses: statuses,
      columns: 'status',
      sortBy: 'manual'
    })

    expect(grouped.get('doing')?.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not crash when a worktree is missing its displayName under Manual sort', () => {
    const worktrees = [
      worktree({
        id: 'a',
        displayName: undefined as unknown as string,
        workspaceStatus: 'doing',
        manualOrder: 100
      }),
      worktree({
        id: 'b',
        displayName: undefined as unknown as string,
        workspaceStatus: 'doing',
        manualOrder: 100
      })
    ]
    // Repro for crash 99657ab1: a worktree reached the sidebar with an
    // undefined displayName, so `a.displayName.localeCompare(...)` threw
    // `Cannot read properties of undefined (reading 'localeCompare')`.
    expect(() =>
      groupWorkspaceKanbanWorktrees({
        worktrees,
        visibleWorktreeIds: visibleIdentities(worktrees),
        workspaceStatuses: statuses,
        columns: 'status',
        sortBy: 'manual'
      })
    ).not.toThrow()
  })

  it('does not crash when a worktree is missing its displayName outside Manual sort', () => {
    const worktrees = [
      worktree({
        id: 'a',
        displayName: undefined as unknown as string,
        workspaceStatus: 'doing',
        lastActivityAt: 10
      }),
      worktree({
        id: 'b',
        displayName: undefined as unknown as string,
        workspaceStatus: 'doing',
        lastActivityAt: 10
      })
    ]
    expect(() =>
      groupWorkspaceKanbanWorktrees({
        worktrees,
        visibleWorktreeIds: visibleIdentities(worktrees),
        workspaceStatuses: statuses,
        columns: 'status',
        sortBy: 'recent'
      })
    ).not.toThrow()
  })

  it('keeps pinned then recent ordering outside Manual sort', () => {
    const worktrees = [
      worktree({
        id: 'a',
        displayName: 'A',
        workspaceStatus: 'doing',
        isPinned: false,
        lastActivityAt: 50
      }),
      worktree({
        id: 'b',
        displayName: 'B',
        workspaceStatus: 'doing',
        isPinned: true,
        lastActivityAt: 1
      })
    ]
    const grouped = groupWorkspaceKanbanWorktrees({
      worktrees,
      visibleWorktreeIds: visibleIdentities(worktrees),
      workspaceStatuses: statuses,
      columns: 'status',
      sortBy: 'recent'
    })

    expect(grouped.get('doing')?.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('ranks priority between pin and recency, and lanes by priority under Priority columns', () => {
    const worktrees = [
      worktree({
        id: 'recent',
        displayName: 'Recent',
        workspaceStatus: 'doing',
        lastActivityAt: 90
      }),
      worktree({
        id: 'low',
        displayName: 'Low',
        workspaceStatus: 'doing',
        priority: 'low',
        lastActivityAt: 99
      }),
      worktree({
        id: 'urgent',
        displayName: 'Urgent',
        workspaceStatus: 'doing',
        priority: 'urgent',
        lastActivityAt: 1
      }),
      worktree({ id: 'pinned', displayName: 'Pinned', workspaceStatus: 'doing', isPinned: true })
    ]
    const group = (columns: 'status' | 'priority') =>
      groupWorkspaceKanbanWorktrees({
        worktrees,
        visibleWorktreeIds: visibleIdentities(worktrees),
        workspaceStatuses: statuses,
        columns,
        sortBy: 'recent'
      })

    expect(
      group('status')
        .get('doing')
        ?.map((item) => item.id)
    ).toEqual(['pinned', 'urgent', 'recent', 'low'])
    const byPriority = group('priority')
    expect([...byPriority.keys()]).toEqual(
      (['urgent', 'high', 'medium', 'low', null] as const).map(getWorkspacePriorityGroupKey)
    )
    expect(byPriority.get(getWorkspacePriorityGroupKey(null))?.map((item) => item.id)).toEqual([
      'pinned',
      'recent'
    ])
  })

  it('does not admit another host row that shares the visible workspace id', () => {
    const local = worktree({ id: 'same', displayName: 'Local', hostId: 'local' })
    const ssh = worktree({ id: 'same', displayName: 'SSH', hostId: 'ssh:box' })

    const grouped = groupWorkspaceKanbanWorktrees({
      worktrees: [local, ssh],
      visibleWorktreeIds: visibleIdentities([local]),
      workspaceStatuses: statuses,
      columns: 'status',
      sortBy: 'recent'
    })

    expect([...grouped.values()].flat().map(getWorktreeHostIdentity)).toEqual([
      getWorktreeHostIdentity(local)
    ])
  })
})
