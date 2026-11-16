import React from 'react'
import { ListTodo } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useWorkTasks } from './use-work-tasks'

export function PlanSidebarNavButton(): React.JSX.Element {
  const openPlanPage = useAppStore((state) => state.openPlanPage)
  const active = useAppStore((state) => state.activeView === 'plan')
  const { dueCount } = useWorkTasks()
  return (
    <button
      type="button"
      onClick={openPlanPage}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <ListTodo
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.plan.PlanSidebarNavButton.label', 'Plan')}
      </span>
      {dueCount > 0 ? (
        <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-4 text-primary-foreground">
          {dueCount}
        </span>
      ) : null}
    </button>
  )
}
