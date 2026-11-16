import { describe, expect, it, vi } from 'vitest'
import { checkLinkActivity, type LinkActivityExec } from './link-activity-check'

const since = '2026-11-16T09:00:00Z'

function fakeExec(overrides: Partial<LinkActivityExec>): LinkActivityExec {
  return {
    gh: vi.fn(async () => ({ stdout: '' })),
    glab: vi.fn(async () => ({ stdout: '{}' })),
    ...overrides
  }
}

describe('checkLinkActivity', () => {
  it('reports a PR updated after the follow-up was set as moved', async () => {
    const gh = vi.fn(async () => ({ stdout: '2026-11-16T10:00:00Z\n' }))
    const link = { kind: 'pr' as const, host: 'github.com', repo: 'unepwcmc/sapi', number: 42 }
    await expect(checkLinkActivity(link, since, fakeExec({ gh }))).resolves.toBe('moved')
    expect(gh).toHaveBeenCalledWith([
      'api',
      '--hostname',
      'github.com',
      'repos/unepwcmc/sapi/pulls/42',
      '--jq',
      '.updated_at'
    ])
  })

  it('reports an untouched MR as idle and encodes its project path', async () => {
    const glab = vi.fn(async () => ({
      stdout: JSON.stringify({ updated_at: '2026-11-15T00:00:00Z' })
    }))
    const link = {
      kind: 'mr' as const,
      host: 'gitlab.internal.unep-wcmc.org',
      project: 'devops/ssh-mananger',
      iid: 7
    }
    await expect(checkLinkActivity(link, since, fakeExec({ glab }))).resolves.toBe('idle')
    expect(glab).toHaveBeenCalledWith([
      'api',
      '--hostname',
      'gitlab.internal.unep-wcmc.org',
      'projects/devops%2Fssh-mananger/merge_requests/7'
    ])
  })

  it('reports unknown when the lookup fails', async () => {
    const gh = vi.fn(async () => {
      throw new Error('HTTP 502')
    })
    const link = { kind: 'pr' as const, host: 'github.com', repo: 'a/b', number: 1 }
    await expect(checkLinkActivity(link, since, fakeExec({ gh }))).resolves.toBe('unknown')
  })

  it('does not call anything for links it cannot check', async () => {
    const exec = fakeExec({})
    const link = { kind: 'worktree' as const, worktreeId: 'wt', label: 'x' }
    await expect(checkLinkActivity(link, since, exec)).resolves.toBe('unknown')
    expect(exec.gh).not.toHaveBeenCalled()
    expect(exec.glab).not.toHaveBeenCalled()
  })
})
