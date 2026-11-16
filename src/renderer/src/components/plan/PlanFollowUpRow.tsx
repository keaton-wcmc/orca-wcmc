import React from 'react'
import { Check, ExternalLink, Trash2 } from 'lucide-react'
import {
  describeWorkTaskLink,
  workTaskLinkUrl
} from '../../../../shared/work-tasks/work-task-links'
import { parseWorkTaskTimeInput } from '../../../../shared/work-tasks/work-task-time-input'
import type { WorkTask } from '../../../../shared/work-tasks/work-task-types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { cn } from '@/lib/utils'

const T = 'auto.components.plan.PlanFollowUpRow'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(getIntlLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function openLink(task: WorkTask): void {
  const link = task.link
  if (!link) {
    return
  }
  if (link.kind === 'worktree' || link.kind === 'agent' || link.kind === 'folder') {
    activateAndRevealWorktree(link.kind === 'folder' ? link.workspaceId : link.worktreeId, {
      sidebarRevealBehavior: 'auto'
    })
    return
  }
  const url = workTaskLinkUrl(link)
  if (url) {
    void window.api.shell.openUrl(url)
  }
}

export function PlanFollowUpRow({
  task,
  onDone,
  onSnooze,
  onRemove
}: {
  task: WorkTask
  onDone: () => void
  onSnooze: (until: string) => void
  onRemove: () => void
}): React.JSX.Element {
  const resolved = task.resolution !== undefined
  const snoozeTo = (input: string): void => {
    const until = parseWorkTaskTimeInput(input, new Date())
    if (until) {
      onSnooze(until)
    }
  }
  const meta = [
    task.link ? describeWorkTaskLink(task.link) : null,
    resolved
      ? translate(`${T}.resolved`, 'Resolved: the linked item moved')
      : task.remind
        ? formatWhen(task.remind.at)
        : null,
    `${task.durationMin} min`
  ].filter((part) => part !== null)

  return (
    <li
      className={cn(
        'group flex items-center gap-3 rounded-md border border-border px-3 py-2',
        resolved && 'opacity-60'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{task.title}</div>
        <div className="truncate text-xs text-muted-foreground">{meta.join(' · ')}</div>
      </div>
      {task.link ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={translate(`${T}.open`, 'Open')}
          onClick={() => openLink(task)}
        >
          <ExternalLink className="size-3.5" />
        </Button>
      ) : null}
      {resolved ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={translate(`${T}.remove`, 'Remove')}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7">
                {translate(`${T}.snooze`, 'Snooze')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => snoozeTo('+1h')}>
                {translate(`${T}.snoozeHour`, '1 hour')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => snoozeTo('tomorrow')}>
                {translate(`${T}.snoozeTomorrow`, 'Tomorrow 09:00')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => snoozeTo('mon')}>
                {translate(`${T}.snoozeMonday`, 'Monday 09:00')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onRemove} variant="destructive">
                {translate(`${T}.delete`, 'Delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="h-7" onClick={onDone}>
            <Check className="size-3.5" />
            {translate(`${T}.done`, 'Done')}
          </Button>
        </>
      )}
    </li>
  )
}
