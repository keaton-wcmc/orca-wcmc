import React from 'react'

/** Linear's numeric scale: 1 urgent, 2 high, 3 medium, 4 low; anything else draws no bars. */
export function getPriorityBarCount(level: number): number {
  if (level === 2) {
    return 3
  }
  if (level === 3) {
    return 2
  }
  if (level === 4) {
    return 1
  }
  return 0
}

/** The three-bar priority glyph shared by Linear issues and workspace priority; callers pick fills. */
export function PriorityBars({
  activeBars,
  activeFill,
  inactiveFill
}: {
  activeBars: number
  activeFill: string
  inactiveFill: string
}): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 16 16" fill="none">
      {[1, 2, 3].map((bar) => {
        const height = bar === 1 ? 5 : bar === 2 ? 8 : 11
        const x = bar === 1 ? 2.25 : bar === 2 ? 6.5 : 10.75
        return (
          <rect
            key={bar}
            x={x}
            y={16 - height}
            width="3.25"
            height={height}
            rx="1"
            fill={bar <= activeBars ? activeFill : inactiveFill}
          />
        )
      })}
    </svg>
  )
}
