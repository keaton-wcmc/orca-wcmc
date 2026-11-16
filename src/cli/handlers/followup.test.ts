import { describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime-client'
import { buildFollowUpDraft } from './followup'

const now = new Date('2026-11-16T09:00:00Z')

function fakeClient(): RuntimeClient {
  const call = vi.fn(async (method: string) => ({
    id: '1',
    ok: true as const,
    result:
      method === 'worktree.show'
        ? { worktree: { id: 'repo::/wt/sapi', displayName: 'sapi-fix', branch: 'fix' } }
        : {},
    _meta: { runtimeId: 'r' }
  }))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the draft builder only uses call(), which this fake implements.
  return { call } as unknown as RuntimeClient
}

const flags = (entries: Record<string, string | boolean>) => new Map(Object.entries(entries))

describe('buildFollowUpDraft', () => {
  it('links a GitHub PR and arms an idle-only reminder', async () => {
    const draft = await buildFollowUpDraft(
      flags({
        title: 'Review nudge',
        remind: '+2h',
        'when-idle': true,
        pr: 'https://github.com/unepwcmc/sapi/pull/42'
      }),
      fakeClient(),
      '/tmp',
      now
    )
    expect(draft).toEqual({
      title: 'Review nudge',
      durationMin: 30,
      link: { kind: 'pr', host: 'github.com', repo: 'unepwcmc/sapi', number: 42 },
      remind: { at: '2026-11-16T11:00:00.000Z', whenIdle: true }
    })
  })

  it('parses a nested-group merge request on the internal GitLab', async () => {
    const draft = await buildFollowUpDraft(
      flags({
        title: 'MR',
        mr: 'https://gitlab.internal.unep-wcmc.org/devops/infra/ssh-mananger/-/merge_requests/7'
      }),
      fakeClient(),
      '/tmp',
      now
    )
    expect(draft.link).toEqual({
      kind: 'mr',
      host: 'gitlab.internal.unep-wcmc.org',
      project: 'devops/infra/ssh-mananger',
      iid: 7
    })
  })

  it('labels a worktree link with its display name', async () => {
    const draft = await buildFollowUpDraft(
      flags({ title: 'Finish', worktree: 'name:sapi-fix' }),
      fakeClient(),
      '/tmp',
      now
    )
    expect(draft.link).toEqual({
      kind: 'worktree',
      worktreeId: 'repo::/wt/sapi',
      label: 'sapi-fix'
    })
  })

  it('explains an unrecognised time', async () => {
    await expect(
      buildFollowUpDraft(flags({ title: 'x', remind: 'soon' }), fakeClient(), '/tmp', now)
    ).rejects.toThrow(
      'Unrecognised time "soon". Try +2h, tomorrow, tomorrow 14:00, fri, or an ISO date.'
    )
  })

  it('refuses --when-idle without a PR or MR', async () => {
    await expect(
      buildFollowUpDraft(
        flags({ title: 'x', remind: '+1h', 'when-idle': true }),
        fakeClient(),
        '/tmp',
        now
      )
    ).rejects.toThrow('--when-idle needs --pr or --mr.')
  })
})
