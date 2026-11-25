import React from 'react'

import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { getLinearPriorityLabel } from '@/components/task-page/task-page-localized-options'
import { PriorityBars, getPriorityBarCount } from '../../../priority-bars'

// Use Linear’s brand priority fills instead of generic Orca state colors.
const LINEAR_PRIORITY_URGENT_FILL = 'lch(66 80 48)'
const LINEAR_PRIORITY_BAR_FILL = 'lch(39.576 1.25 282)'

export function getLinearPriorityIconLabel(priority: number): string {
  return getLinearPriorityLabel(priority)
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
  const t = useTranslate()
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
          {t('auto.components.linear.priority.icon.priorityValue', 'Priority: {{label}}', {
            label
          })}
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
          {t('auto.components.linear.priority.icon.priorityValue', 'Priority: {{label}}', {
            label
          })}
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
        {t('auto.components.linear.priority.icon.priorityValue', 'Priority: {{label}}', {
          label
        })}
      </span>
    </span>
  )
}
