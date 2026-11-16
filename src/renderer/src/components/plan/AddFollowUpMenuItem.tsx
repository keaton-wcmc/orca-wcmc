import React from 'react'
import { BellPlus } from 'lucide-react'
import type { Worktree } from '../../../../shared/worktree/types'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAddFollowUpDialog } from './add-follow-up-dialog-store'

export function AddFollowUpMenuItem({
  worktree,
  disabled
}: {
  worktree: Pick<Worktree, 'id' | 'displayName' | 'branch'>
  disabled?: boolean
}): React.JSX.Element {
  const openDialog = useAddFollowUpDialog((state) => state.openDialog)
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() =>
        openDialog({
          link: {
            kind: 'worktree',
            worktreeId: worktree.id,
            label: worktree.displayName || worktree.branch || worktree.id
          }
        })
      }
    >
      <BellPlus className="size-3.5" />
      {translate('auto.components.plan.AddFollowUpMenuItem.label', 'Add follow-up…')}
    </DropdownMenuItem>
  )
}
