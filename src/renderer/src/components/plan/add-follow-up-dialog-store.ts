import { create } from 'zustand'
import type { WorkTaskLink } from '../../../../shared/work-tasks/work-task-types'

// Standalone so a context menu can open it after the menu itself unmounts.
type AddFollowUpDialogState = {
  open: boolean
  presetLink: WorkTaskLink | undefined
  onCreated: (() => void) | undefined
  openDialog: (options?: { link?: WorkTaskLink; onCreated?: () => void }) => void
  closeDialog: () => void
}

export const useAddFollowUpDialog = create<AddFollowUpDialogState>((set) => ({
  open: false,
  presetLink: undefined,
  onCreated: undefined,
  openDialog: (options) =>
    set({ open: true, presetLink: options?.link, onCreated: options?.onCreated }),
  closeDialog: () => set({ open: false, presetLink: undefined, onCreated: undefined })
}))
