import { ghExecFileAsync } from '../git/command-runner/gh-exec-file'
import { glabExecFileAsync } from '../git/command-runner/glab-exec-file'
import type { WorkTaskLink } from '../../shared/work-tasks/work-task-types'

export type LinkActivity = 'moved' | 'idle' | 'unknown'

export type LinkActivityExec = {
  gh: (args: string[]) => Promise<{ stdout: string }>
  glab: (args: string[]) => Promise<{ stdout: string }>
}

const defaultExec: LinkActivityExec = {
  gh: (args) => ghExecFileAsync(args),
  glab: (args) => glabExecFileAsync(args)
}

/** Whether a linked PR or MR changed since `since`; any doubt reads as unknown. */
export async function checkLinkActivity(
  link: WorkTaskLink,
  since: string,
  exec: LinkActivityExec = defaultExec
): Promise<LinkActivity> {
  try {
    const updatedAt = await readUpdatedAt(link, exec)
    if (updatedAt === null || Number.isNaN(Date.parse(updatedAt))) {
      return 'unknown'
    }
    return Date.parse(updatedAt) > Date.parse(since) ? 'moved' : 'idle'
  } catch {
    return 'unknown'
  }
}

async function readUpdatedAt(link: WorkTaskLink, exec: LinkActivityExec): Promise<string | null> {
  if (link.kind === 'pr') {
    const { stdout } = await exec.gh([
      'api',
      '--hostname',
      link.host,
      `repos/${link.repo}/pulls/${link.number}`,
      '--jq',
      '.updated_at'
    ])
    return stdout.trim() || null
  }
  if (link.kind === 'mr') {
    const { stdout } = await exec.glab([
      'api',
      '--hostname',
      link.host,
      `projects/${encodeURIComponent(link.project)}/merge_requests/${link.iid}`
    ])
    const parsed: unknown = JSON.parse(stdout)
    return typeof parsed === 'object' &&
      parsed !== null &&
      'updated_at' in parsed &&
      typeof parsed.updated_at === 'string'
      ? parsed.updated_at
      : null
  }
  return null
}
