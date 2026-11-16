import type { WorkTaskLink } from './work-task-types'

/** `https://<host>/<owner>/<repo>/pull/<n>`, any GitHub host. */
export function parsePullRequestUrl(input: string): Extract<WorkTaskLink, { kind: 'pr' }> | null {
  const url = safeUrl(input)
  const match = url ? /^\/([^/]+\/[^/]+)\/pull\/(\d+)\/?$/.exec(url.pathname) : null
  if (!url || !match) {
    return null
  }
  return { kind: 'pr', host: url.host, repo: match[1], number: Number(match[2]) }
}

/** `https://<host>/<group>/<subgroups...>/<project>/-/merge_requests/<iid>`. */
export function parseMergeRequestUrl(input: string): Extract<WorkTaskLink, { kind: 'mr' }> | null {
  const url = safeUrl(input)
  const match = url ? /^\/(.+?)\/-\/merge_requests\/(\d+)\/?$/.exec(url.pathname) : null
  if (!url || !match) {
    return null
  }
  return { kind: 'mr', host: url.host, project: match[1], iid: Number(match[2]) }
}

export function describeWorkTaskLink(link: WorkTaskLink): string {
  switch (link.kind) {
    case 'worktree':
    case 'folder':
    case 'agent':
      return link.label
    case 'pr':
      return `${link.repo}#${link.number}`
    case 'mr':
      return `${link.project}!${link.iid}`
    case 'slack':
      return 'Slack thread'
  }
}

export function workTaskLinkUrl(link: WorkTaskLink): string | null {
  switch (link.kind) {
    case 'pr':
      return `https://${link.host}/${link.repo}/pull/${link.number}`
    case 'mr':
      return `https://${link.host}/${link.project}/-/merge_requests/${link.iid}`
    case 'slack':
      return link.url
    default:
      return null
  }
}

function safeUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}
