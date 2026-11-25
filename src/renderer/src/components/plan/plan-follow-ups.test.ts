import { describe, expect, it, vi } from 'vitest'
import type { WorkTask } from '../../../../shared/work-tasks/work-task-types'

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: vi.fn() }))

const { countDueFollowUps } = await import('./use-work-tasks')
const { linkFromUrl } = await import('./AddFollowUpDialog')

function task(fields: Partial<WorkTask>): WorkTask {
  return {
    id: 'id',
    title: 't',
    durationMin: 30,
    state: 'open',
    createdAt: '2026-11-16T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    ...fields
  }
}

const fired = { at: '2026-11-16T09:00:00Z', whenIdle: false, firedAt: '2026-11-16T09:00:00Z' }

describe('countDueFollowUps', () => {
  it('counts fired, open follow-ups only', () => {
    expect(
      countDueFollowUps([
        task({ remind: fired }),
        task({ remind: { at: '2026-11-17T09:00:00Z', whenIdle: false } }),
        task({ remind: fired, state: 'done' }),
        task({})
      ])
    ).toBe(1)
  })
})

describe('linkFromUrl', () => {
  it('recognises PR, MR and Slack links and rejects others', () => {
    expect(linkFromUrl('https://github.com/unepwcmc/sapi/pull/42')).toMatchObject({ kind: 'pr' })
    expect(
      linkFromUrl('https://gitlab.internal.unep-wcmc.org/devops/cve/-/merge_requests/3')
    ).toMatchObject({ kind: 'mr', project: 'devops/cve', iid: 3 })
    expect(linkFromUrl('https://unep-wcmc.slack.com/archives/C1/p123')).toMatchObject({
      kind: 'slack'
    })
    expect(linkFromUrl('https://example.com/whatever')).toBeNull()
  })
})
