import React from 'react'

import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { WorkspacePriority } from '../../../shared/workspace-priority'
import { PriorityBars, getPriorityBarCount } from './priority-bars'

// Why Linear's numbers: workspace priority adopts Linear's scale, so it shares its glyph.
const LINEAR_PRIORITY_LEVEL: Record<WorkspacePriority, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4
}

// Why the Task page's keys: same scale and words, so every locale's Linear translations apply.
export function getWorkspacePriorityLabel(priority: WorkspacePriority | null): string {
  switch (priority) {
    case 'urgent':
      return translate('auto.components.TaskPage.f373ab1a4f', 'Urgent')
    case 'high':
      return translate('auto.components.TaskPage.345b169f1f', 'High')
    case 'medium':
      return translate('auto.components.TaskPage.7fd59c18d8', 'Medium')
    case 'low':
      return translate('auto.components.TaskPage.69591944e7', 'Low')
    case null:
      return translate('auto.components.TaskPage.713179dfdc', 'No priority')
  }
}

export function WorkspacePriorityIcon({
  priority,
  className,
  announce = false
}: {
  priority: WorkspacePriority | null
  className?: string
  /** Speak the level; leave off where visible text beside the glyph already names it. */
  announce?: boolean
}): React.JSX.Element {
  const srLabel = announce ? (
    <span className="sr-only">
      {translate('auto.components.linear.priority.icon.c43d3e065b', 'Priority:')}{' '}
      {getWorkspacePriorityLabel(priority)}
    </span>
  ) : null
  const ariaHidden = announce ? undefined : true
  if (priority === 'urgent') {
    return (
      <span
        aria-hidden={ariaHidden}
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-destructive text-3xs font-semibold leading-none text-destructive-foreground',
          className
        )}
      >
        <span aria-hidden="true">!</span>
        {srLabel}
      </span>
    )
  }
  if (!priority) {
    return (
      <span
        aria-hidden={ariaHidden}
        className={cn('inline-flex size-4 shrink-0 items-center justify-center', className)}
      >
        <span
          aria-hidden="true"
          className="size-3 rounded-full border border-dashed border-muted-foreground/55"
        />
        {srLabel}
      </span>
    )
  }
  return (
    <span
      aria-hidden={ariaHidden}
      className={cn('inline-flex size-4 shrink-0 items-center justify-center', className)}
    >
      <PriorityBars
        activeBars={getPriorityBarCount(LINEAR_PRIORITY_LEVEL[priority])}
        activeFill="currentColor"
        inactiveFill="color-mix(in srgb, currentColor 28%, transparent)"
      />
      {srLabel}
    </span>
  )
}

type LaneIconProps = { className?: string }

function UrgentPriorityLaneIcon({ className }: LaneIconProps): React.JSX.Element {
  return <WorkspacePriorityIcon priority="urgent" className={className} />
}

function HighPriorityLaneIcon({ className }: LaneIconProps): React.JSX.Element {
  return <WorkspacePriorityIcon priority="high" className={className} />
}

function MediumPriorityLaneIcon({ className }: LaneIconProps): React.JSX.Element {
  return <WorkspacePriorityIcon priority="medium" className={className} />
}

function LowPriorityLaneIcon({ className }: LaneIconProps): React.JSX.Element {
  return <WorkspacePriorityIcon priority="low" className={className} />
}

function NoPriorityLaneIcon({ className }: LaneIconProps): React.JSX.Element {
  return <WorkspacePriorityIcon priority={null} className={className} />
}

/** For surfaces that take an icon component, such as Group by section headers. */
export function getWorkspacePriorityLaneIcon(
  priority: WorkspacePriority | null
): React.ComponentType<LaneIconProps> {
  switch (priority) {
    case 'urgent':
      return UrgentPriorityLaneIcon
    case 'high':
      return HighPriorityLaneIcon
    case 'medium':
      return MediumPriorityLaneIcon
    case 'low':
      return LowPriorityLaneIcon
    case null:
      return NoPriorityLaneIcon
  }
}
