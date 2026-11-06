export const WORKSPACE_BOARD_COLUMNS = ['status', 'priority'] as const
export type WorkspaceBoardColumns = (typeof WORKSPACE_BOARD_COLUMNS)[number]

export function normalizeWorkspaceBoardColumns(value: unknown): WorkspaceBoardColumns {
  return value === 'priority' ? 'priority' : 'status'
}
