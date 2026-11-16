import type { RuntimeWorktreeRecord } from '../../shared/runtime-worktree-contracts'
import { isWorkspacePriority } from '../../shared/workspace-priority'
import {
  describeWorkTaskLink,
  parseMergeRequestUrl,
  parsePullRequestUrl
} from '../../shared/work-tasks/work-task-links'
import {
  parseWorkTaskTimeInput,
  WORK_TASK_TIME_INPUT_HINT
} from '../../shared/work-tasks/work-task-time-input'
import type { WorkTask, WorkTaskDraft, WorkTaskLink } from '../../shared/work-tasks/work-task-types'
import type { CommandHandler } from '../dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import { RuntimeClientError, type RuntimeClient } from '../runtime-client'
import { resolveCurrentWorktreeSelector } from '../selectors'

const DEFAULT_DURATION_MIN = 30
const MIN_ID_PREFIX = 8

function invalid(message: string): RuntimeClientError {
  return new RuntimeClientError('invalid_argument', message)
}

export function parseFollowUpTime(value: string, now: Date): string {
  const parsed = parseWorkTaskTimeInput(value, now)
  if (!parsed) {
    throw invalid(`Unrecognised time "${value}". ${WORK_TASK_TIME_INPUT_HINT}`)
  }
  return parsed
}

async function resolveLink(
  flags: Map<string, string | boolean>,
  client: RuntimeClient,
  cwd: string
): Promise<WorkTaskLink | undefined> {
  const given = ['worktree', 'pr', 'mr', 'slack'].filter((name) => flags.has(name))
  if (given.length > 1) {
    throw invalid('Pass only one of --worktree, --pr, --mr or --slack.')
  }
  const pr = getOptionalStringFlag(flags, 'pr')
  if (pr) {
    const link = parsePullRequestUrl(pr)
    if (!link) {
      throw invalid(`--pr expects a pull request URL like https://github.com/owner/repo/pull/42`)
    }
    return link
  }
  const mr = getOptionalStringFlag(flags, 'mr')
  if (mr) {
    const link = parseMergeRequestUrl(mr)
    if (!link) {
      throw invalid(
        `--mr expects a merge request URL like https://host/group/project/-/merge_requests/7`
      )
    }
    return link
  }
  const slack = getOptionalStringFlag(flags, 'slack')
  if (slack) {
    return { kind: 'slack', url: slack }
  }
  const worktree = getOptionalStringFlag(flags, 'worktree')
  if (worktree) {
    const selector =
      worktree === 'current' ? await resolveCurrentWorktreeSelector(cwd, client) : worktree
    const shown = await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
      worktree: selector
    })
    const record = shown.result.worktree
    return {
      kind: 'worktree',
      worktreeId: record.id,
      label: record.displayName || record.branch || record.id
    }
  }
  return undefined
}

export async function buildFollowUpDraft(
  flags: Map<string, string | boolean>,
  client: RuntimeClient,
  cwd: string,
  now: Date
): Promise<WorkTaskDraft> {
  const link = await resolveLink(flags, client, cwd)
  const whenIdle = flags.get('when-idle') === true
  if (whenIdle && link?.kind !== 'pr' && link?.kind !== 'mr') {
    throw invalid('--when-idle needs --pr or --mr.')
  }
  const remind = getOptionalStringFlag(flags, 'remind')
  if (whenIdle && !remind) {
    throw invalid('--when-idle needs --remind.')
  }
  const due = getOptionalStringFlag(flags, 'due')
  const priority = getOptionalStringFlag(flags, 'priority')
  if (priority !== undefined && !isWorkspacePriority(priority)) {
    throw invalid('--priority must be urgent, high, medium or low.')
  }
  return {
    title: getRequiredStringFlag(flags, 'title'),
    durationMin: getOptionalPositiveIntegerFlag(flags, 'duration') ?? DEFAULT_DURATION_MIN,
    ...(priority ? { priority } : {}),
    ...(due ? { dueAt: parseFollowUpTime(due, now) } : {}),
    ...(link ? { link } : {}),
    ...(remind ? { remind: { at: parseFollowUpTime(remind, now), whenIdle } } : {})
  }
}

async function resolveFollowUpId(client: RuntimeClient, prefix: string): Promise<string> {
  if (prefix.length < MIN_ID_PREFIX) {
    throw invalid(`--id needs at least ${MIN_ID_PREFIX} characters.`)
  }
  const listed = await client.call<{ tasks: WorkTask[] }>('workTask.list')
  const matches = listed.result.tasks.filter((task) => task.id.startsWith(prefix))
  if (matches.length !== 1) {
    throw invalid(
      matches.length === 0
        ? `No open follow-up matches "${prefix}".`
        : `"${prefix}" matches ${matches.length} follow-ups; give more of the id.`
    )
  }
  return matches[0].id
}

export function formatFollowUpList(result: { tasks: WorkTask[] }): string {
  if (result.tasks.length === 0) {
    return 'No follow-ups.'
  }
  return result.tasks
    .map((task) => {
      const when = task.remind ? formatLocal(task.remind.at) : '—'
      const state = task.resolution ? 'resolved' : task.state
      const link = task.link ? `  (${describeWorkTaskLink(task.link)})` : ''
      return `${task.id.slice(0, MIN_ID_PREFIX)}  ${when.padEnd(16)}  ${state.padEnd(8)}  ${task.title}${link}`
    })
    .join('\n')
}

function formatFollowUp(result: { task: WorkTask }): string {
  const reminder = result.task.remind ? `, reminder ${formatLocal(result.task.remind.at)}` : ''
  return `${result.task.id.slice(0, MIN_ID_PREFIX)}  ${result.task.title} (${result.task.state}${reminder})`
}

function formatLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const FOLLOWUP_HANDLERS: Record<string, CommandHandler> = {
  'followup add': async ({ flags, client, cwd, json }) => {
    const draft = await buildFollowUpDraft(flags, client, cwd, new Date())
    printResult(
      await client.call<{ task: WorkTask }>('workTask.create', draft),
      json,
      formatFollowUp
    )
  },
  'followup ls': async ({ client, json }) => {
    printResult(await client.call<{ tasks: WorkTask[] }>('workTask.list'), json, formatFollowUpList)
  },
  'followup snooze': async ({ flags, client, json }) => {
    const id = await resolveFollowUpId(client, getRequiredStringFlag(flags, 'id'))
    const until = parseFollowUpTime(getRequiredStringFlag(flags, 'until'), new Date())
    printResult(
      await client.call<{ task: WorkTask }>('workTask.snooze', { id, until }),
      json,
      formatFollowUp
    )
  },
  'followup done': async ({ flags, client, json }) => {
    const id = await resolveFollowUpId(client, getRequiredStringFlag(flags, 'id'))
    printResult(
      await client.call<{ task: WorkTask }>('workTask.done', { id }),
      json,
      formatFollowUp
    )
  },
  'followup rm': async ({ flags, client, json }) => {
    const id = await resolveFollowUpId(client, getRequiredStringFlag(flags, 'id'))
    printResult(
      await client.call<Record<string, never>>('workTask.remove', { id }),
      json,
      () => 'Removed.'
    )
  }
}
