import React from 'react'

import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { PriorityBars, getPriorityBarCount } from './priority-bars'

// Why: Linear priority glyphs are provider-brand signals, so their fills match
// Linear's lower-contrast icon colors instead of Orca's generic state tokens.
const LINEAR_PRIORITY_URGENT_FILL = 'lch(66 80 48)'
const LINEAR_PRIORITY_BAR_FILL = 'lch(39.576 1.25 282)'

const LINEAR_PRIORITY_ICON_LABELS: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low'
}

export function getLinearPriorityIconLabel(priority: number): string {
  return LINEAR_PRIORITY_ICON_LABELS[priority] ?? `P${priority}`
}

export function LinearPriorityIcon({
  priority,
  className,
  label = getLinearPriorityIconLabel(priority)
}: {
  priority: number
  className?: string
  label?: string
}): React.JSX.Element {
  if (priority === 1) {
    return (
      <span
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-[10px] font-semibold leading-none text-white',
          className
        )}
        style={{ backgroundColor: LINEAR_PRIORITY_URGENT_FILL }}
        title={label}
      >
        <span aria-hidden="true">!</span>
        <span className="sr-only">
          {translate('auto.components.linear.priority.icon.c43d3e065b', 'Priority:')} {label}
        </span>
      </span>
    )
  }

  if (priority === 0) {
    return (
      <span
        className={cn('inline-flex size-4 shrink-0 items-center justify-center', className)}
        title={label}
      >
        <span
          aria-hidden="true"
          className="size-3 rounded-full border border-muted-foreground/55"
        />
        <span className="sr-only">
          {translate('auto.components.linear.priority.icon.c43d3e065b', 'Priority:')} {label}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'linear-priority-bars inline-flex size-4 shrink-0 items-center justify-center',
        className
      )}
      title={label}
    >
      <PriorityBars
        activeBars={getPriorityBarCount(priority)}
        activeFill={LINEAR_PRIORITY_BAR_FILL}
        inactiveFill="var(--linear-priority-bar-inactive-fill)"
      />
      <span className="sr-only">
        {translate('auto.components.linear.priority.icon.c43d3e065b', 'Priority:')} {label}
      </span>
    </span>
  )
}
