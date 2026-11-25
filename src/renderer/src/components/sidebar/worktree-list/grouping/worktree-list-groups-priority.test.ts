import { describe, expect, it } from 'vitest'
import { buildRows } from './build-rows.test-fixture'
import { repo, worktree } from './worktree-list-groups-test-fixtures'
import type { ProjectGroup } from '../../../../../../shared/project/groups/project-group-types'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspaces/folder-workspace-types'

const group: ProjectGroup = {
  id: 'group-1',
  name: 'Multi-repo Group',
  parentPath: '/tmp/parent',
  parentGroupId: null,
  createdFrom: 'folder-scan',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1
}

const folderWorkspace: FolderWorkspace = {
  id: 'fw-1',
  projectGroupId: group.id,
  name: 'Folder workspace',
  folderPath: '/tmp/parent',
  linkedTask: null,
  comment: '',
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 1,
  lastActivityAt: 1,
  createdAt: 1,
  updatedAt: 1,
  workspaceStatus: 'in-progress',
  priority: 'urgent'
}

describe('Group by Priority', () => {
  it('orders lanes most urgent first and untriaged last, seating a folder workspace in its own', () => {
    const worktrees = [
      { ...worktree, id: 'wt-low', path: '/tmp/low', priority: 'low' as const },
      { ...worktree, id: 'wt-untriaged', path: '/tmp/untriaged' },
      { ...worktree, id: 'wt-high', path: '/tmp/high', priority: 'high' as const }
    ]
    const rows = buildRows(
      'priority',
      worktrees,
      new Map([[repo.id, { ...repo, projectGroupId: group.id }]]),
      null,
      new Set<string>(),
      undefined,
      undefined,
      'manual',
      {},
      new Map(worktrees.map((entry) => [entry.id, entry])),
      false,
      undefined,
      [group],
      new Set(),
      new Map(),
      new Map(),
      [],
      undefined,
      [folderWorkspace]
    )
    const sequence = rows.map((row) => {
      if (row.type === 'header') {
        return row.icon.kind === 'priority' ? `# ${row.icon.priority ?? 'none'}` : row.key
      }
      if (row.type === 'item') {
        return row.worktree.id
      }
      return row.type === 'folder-workspace' ? row.folderWorkspace.id : row.type
    })
    expect(sequence).toEqual([
      '# urgent',
      'fw-1',
      '# high',
      'wt-high',
      '# low',
      'wt-low',
      '# none',
      'wt-untriaged'
    ])
  })
})
