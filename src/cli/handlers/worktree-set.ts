import { withWorktreeSelectorRecovery } from '../worktree-selector-recovery'
import type { RuntimeWorktreeSetResult } from '../../shared/runtime-types'
import type { CommandHandler } from '../dispatch'
import { formatWorktreeShow, printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { getOptionalStringFlag, getOptionalStringFlagAllowingEmpty } from '../flags'
import { getRequiredWorktreeSelector } from '../selectors'
import { formatCrossStoreParentLine } from './worktree-lineage-summary'
import { resolveSetParentFields } from './worktree-parent-fields'
import {
  assertWorktreeParentFlagsCompatible,
  getWorkspaceKeyParentSelector
} from './worktree-create-parent-selector'
import { getOptionalLinearIssueLinkFlag } from './worktree-linear-issue-link'
import { getWorktreeReadFlags } from './worktree-unread-flag'
import {
  assertWorktreePrioritySupported,
  getOptionalWorktreePriorityFlag
} from './worktree-priority-flag'
import { getReviewTargetLinkFlags } from './worktree-review-link-flags'
import { assertGitLabLinkFlagProjectsMatch } from './worktree-gitlab-link-context'

export const handleWorktreeSet: CommandHandler = async ({ flags, client, cwd, json }) => {
  assertWorktreeParentFlagsCompatible(
    flags,
    'Choose either --parent-worktree or --no-parent, not both.'
  )
  const parentSelector = getOptionalStringFlag(flags, 'parent-worktree')
  if (parentSelector && getWorkspaceKeyParentSelector(parentSelector)?.startsWith('folder:')) {
    throw new RuntimeClientError(
      'invalid_argument',
      `Parent selector "${parentSelector}" is a folder. Folder parents are accepted only by orca worktree create.`
    )
  }
  const readFlags = getWorktreeReadFlags(flags)
  const priority = getOptionalWorktreePriorityFlag(flags)
  const reviewLinks = getReviewTargetLinkFlags(flags, { nullable: true })
  const linearIssueLink = getOptionalLinearIssueLinkFlag(flags, 'linear-issue', {
    allowNull: true
  })
  const worktree = await getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
  await assertGitLabLinkFlagProjectsMatch(flags, client, { worktree })
  const parentFields = await resolveSetParentFields(flags, cwd, client)
  await assertWorktreePrioritySupported(client, priority)
  const pending = client.call<RuntimeWorktreeSetResult>('worktree.set', {
    worktree,
    displayName: getOptionalStringFlag(flags, 'display-name'),
    ...reviewLinks,
    ...linearIssueLink,
    // An explicit empty value clears the stored comment.
    comment: getOptionalStringFlagAllowingEmpty(flags, 'comment'),
    workspaceStatus: getOptionalStringFlag(flags, 'workspace-status'),
    priority,
    ...readFlags,
    ...parentFields,
    noParent: flags.get('no-parent') === true
  })
  const result = await withWorktreeSelectorRecovery(
    pending,
    parentSelector
      ? [
          `Orca could not find the worktree selector "${worktree}" or the parent selector "${parentSelector}". The server did not identify which selector failed.`,
          'Check both selectors with orca worktree show --worktree <selector> --json.'
        ]
      : []
  )
  if (!json) {
    for (const warning of result.result.warnings ?? []) {
      console.error(`warning: ${warning.message}`)
    }
    // The same-store lineage fields stay null for a parent on another machine.
    const crossStoreLineage = result.result.worktree.crossStoreLineage
    if (parentFields.crossStoreParent && crossStoreLineage) {
      console.error(formatCrossStoreParentLine(crossStoreLineage))
    }
  }
  printResult(result, json, formatWorktreeShow)
}
