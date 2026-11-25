import { normalizeWorkspaceBoardColumns } from '../../../../../shared/workspace-board-columns'
import {
  clampWorkspaceBoardColumnWidth,
  clampWorkspaceBoardOpacity
} from '../../../../../shared/workspace/status/workspace-statuses'
import type { PersistedUIState } from '../../../../../shared/orca-profiles/persisted-ui-state-types'

export function hydrateWorkspaceBoardPreferences(ui: PersistedUIState): {
  workspaceBoardOpacity: number
  workspaceBoardColumnWidth: number
  workspaceBoardColumns: ReturnType<typeof normalizeWorkspaceBoardColumns>
} {
  return {
    workspaceBoardOpacity: clampWorkspaceBoardOpacity(ui.workspaceBoardOpacity),
    workspaceBoardColumnWidth: clampWorkspaceBoardColumnWidth(ui.workspaceBoardColumnWidth),
    workspaceBoardColumns: normalizeWorkspaceBoardColumns(ui.workspaceBoardColumns)
  }
}
