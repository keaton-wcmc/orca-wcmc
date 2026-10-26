import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import {
  normalizeWorkspaceBoardColumns,
  type WorkspaceBoardColumns
} from '../../../../shared/workspace-board-columns'

export function WorkspaceKanbanColumnsToggle(props: {
  columns: WorkspaceBoardColumns
  onColumnsChange: (columns: WorkspaceBoardColumns) => void
}) {
  const options = [
    {
      id: 'status',
      label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.e029a2d775', 'Status')
    },
    { id: 'priority', label: translate('auto.components.TaskPage.c8d5bec5f7', 'Priority') }
  ] as const
  return (
    <div className="shrink-0 rounded-md bg-muted p-0.5">
      <ToggleGroup
        variant="segmented"
        size="xs"
        type="single"
        spacing={1}
        value={props.columns}
        onValueChange={(value) => {
          if (value) {
            props.onColumnsChange(normalizeWorkspaceBoardColumns(value))
          }
        }}
        aria-label={translate(
          'auto.components.sidebar.WorkspaceKanbanColumnsToggle.boardColumns',
          'Board columns'
        )}
        className="h-6"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.id} value={option.id}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
