import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { ChartNoAxesColumnIncreasing } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  WORKSPACE_PRIORITIES,
  getSharedWorkspacePriority,
  type WorkspacePriority
} from '../../../../shared/workspace-priority'
import type { Worktree } from '../../../../shared/worktree/types'
import { WorkspacePriorityIcon, getWorkspacePriorityLabel } from '../workspace-priority-icon'

// Linear's menu order: clearing first, then most to least urgent.
const MENU_PRIORITIES: readonly (WorkspacePriority | null)[] = [null, ...WORKSPACE_PRIORITIES]
const NO_PRIORITY_VALUE = 'none'

export function WorktreePriorityMenuItems(props: {
  worktrees: readonly Worktree[]
  deletingContext: boolean
  isMultiContext: boolean
  onAssignPriority: (priority: WorkspacePriority | null) => void
}) {
  // Why: a multi-selection that disagrees checks no radio.
  const shared = getSharedWorkspacePriority(props.worktrees)
  const value = shared === undefined ? '' : (shared ?? NO_PRIORITY_VALUE)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={props.deletingContext}>
        <ChartNoAxesColumnIncreasing className="size-3.5" />
        {props.isMultiContext
          ? translate('auto.components.sidebar.WorktreeContextMenu.setPriorities', 'Set Priorities')
          : translate('auto.components.sidebar.WorktreeContextMenu.setPriority', 'Set Priority')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuRadioGroup value={value}>
          {MENU_PRIORITIES.map((priority) => (
            <DropdownMenuRadioItem
              key={priority ?? NO_PRIORITY_VALUE}
              value={priority ?? NO_PRIORITY_VALUE}
              onSelect={() => props.onAssignPriority(priority)}
            >
              <WorkspacePriorityIcon priority={priority} className="size-3.5" />
              {getWorkspacePriorityLabel(priority)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
