/** Linear's scale, most urgent first. A workspace with none set is untriaged. */
export const WORKSPACE_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const

export type WorkspacePriority = (typeof WORKSPACE_PRIORITIES)[number]

/** Group-by lane order: Linear's, with untriaged workspaces collected last. */
export const WORKSPACE_PRIORITY_LANES: readonly (WorkspacePriority | null)[] = [
  ...WORKSPACE_PRIORITIES,
  null
]

/** The English copy, which the phone draws; the desktop localizes through Linear's labels. */
export function getWorkspacePriorityEnglishLabel(priority: WorkspacePriority | null): string {
  switch (priority) {
    case 'urgent':
      return 'Urgent'
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    case 'low':
      return 'Low'
    case null:
      return 'No priority'
  }
}

const WORKSPACE_PRIORITY_GROUP_PREFIX = 'workspace-priority:'
const NO_PRIORITY_GROUP_KEY = `${WORKSPACE_PRIORITY_GROUP_PREFIX}none`

// Why untriaged ranks between Medium and Low: most workspaces never get a priority, so marking one
// Low must sink it below them rather than lift it above.
const TRIAGE_RANK: Record<WorkspacePriority, number> = { urgent: 0, high: 1, medium: 2, low: 4 }
const UNTRIAGED_RANK = 3

export function isWorkspacePriority(value: unknown): value is WorkspacePriority {
  return WORKSPACE_PRIORITIES.some((priority) => priority === value)
}

/** A row's priority; a missing, cleared or unknown (newer host) value reads as untriaged. */
export function getWorkspacePriority(row: {
  priority?: WorkspacePriority | null
}): WorkspacePriority | null {
  return isWorkspacePriority(row.priority) ? row.priority : null
}

export function storeWorkspacePriority(
  record: { priority?: WorkspacePriority | null },
  priority: WorkspacePriority | null | undefined
): void {
  if (isWorkspacePriority(priority)) {
    record.priority = priority
  } else {
    // Why: null is only the wire's "clear"; untriaged rows store nothing.
    delete record.priority
  }
}

/** The priority every row shares; undefined when there are none or they disagree. */
export function getSharedWorkspacePriority(
  rows: readonly { priority?: WorkspacePriority | null }[]
): WorkspacePriority | null | undefined {
  const [first, ...rest] = rows
  if (!first) {
    return undefined
  }
  const priority = getWorkspacePriority(first)
  return rest.every((row) => getWorkspacePriority(row) === priority) ? priority : undefined
}

/** A spread for row projections: `{ priority }` when triaged, never an untriaged key. */
export function workspacePriorityField(row: { priority?: WorkspacePriority | null }): {
  priority?: WorkspacePriority
} {
  const priority = getWorkspacePriority(row)
  return priority ? { priority } : {}
}

/** Attention order within an Agent Activity tier: higher priority first. */
export function compareWorkspacePriority(
  a: { priority?: WorkspacePriority | null },
  b: { priority?: WorkspacePriority | null }
): number {
  return triageRank(a) - triageRank(b)
}

function triageRank(row: { priority?: WorkspacePriority | null }): number {
  const priority = getWorkspacePriority(row)
  return priority ? TRIAGE_RANK[priority] : UNTRIAGED_RANK
}

export function getWorkspacePriorityGroupKey(priority: WorkspacePriority | null): string {
  return priority ? `${WORKSPACE_PRIORITY_GROUP_PREFIX}${priority}` : NO_PRIORITY_GROUP_KEY
}

/** Rows bucketed into lanes in WORKSPACE_PRIORITY_LANES order; empty lanes are omitted. */
export function groupRowsByWorkspacePriority<T extends { priority?: WorkspacePriority | null }>(
  rows: readonly T[]
): { priority: WorkspacePriority | null; key: string; rows: T[] }[] {
  const byKey = new Map<string, T[]>()
  for (const row of rows) {
    const key = getWorkspacePriorityGroupKey(getWorkspacePriority(row))
    const lane = byKey.get(key)
    if (lane) {
      lane.push(row)
    } else {
      byKey.set(key, [row])
    }
  }
  return WORKSPACE_PRIORITY_LANES.flatMap((priority) => {
    const key = getWorkspacePriorityGroupKey(priority)
    const lane = byKey.get(key)
    return lane ? [{ priority, key, rows: lane }] : []
  })
}

/** The lane a group key names; undefined when the key is not a priority lane. */
export function getWorkspacePriorityFromGroupKey(
  groupKey: string
): WorkspacePriority | null | undefined {
  if (groupKey === NO_PRIORITY_GROUP_KEY) {
    return null
  }
  if (!groupKey.startsWith(WORKSPACE_PRIORITY_GROUP_PREFIX)) {
    return undefined
  }
  const priority = groupKey.slice(WORKSPACE_PRIORITY_GROUP_PREFIX.length)
  return isWorkspacePriority(priority) ? priority : undefined
}
