import type { Worktree } from '../workspace-list/workspace-list-types'

export function bucketWorktreesByKey(
  items: readonly Worktree[],
  keyOf: (worktree: Worktree) => string
): Map<string, Worktree[]> {
  const buckets = new Map<string, Worktree[]>()
  for (const worktree of items) {
    const key = keyOf(worktree)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(worktree)
    } else {
      buckets.set(key, [worktree])
    }
  }
  return buckets
}
