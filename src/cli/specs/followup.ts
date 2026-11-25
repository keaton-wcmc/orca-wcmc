import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

const TIME_NOTE = 'Times accept +30m, +2h, +1d, tomorrow, tomorrow 14:00, mon..sun, or an ISO date.'

export const FOLLOWUP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['followup', 'add'],
    summary: 'Add a follow-up, optionally with a reminder',
    usage:
      'orca followup add --title <text> [--duration <minutes>] [--remind <time>] [--when-idle] [--due <time>] [--priority <urgent|high|medium|low>] [--worktree <selector> | --pr <url> | --mr <url> | --slack <url>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'title',
      'duration',
      'remind',
      'when-idle',
      'due',
      'priority',
      'worktree',
      'pr',
      'mr',
      'slack'
    ],
    notes: [
      TIME_NOTE,
      '--when-idle fires the reminder only if the linked PR or MR has not changed since you added it.',
      '--worktree current links the worktree containing the current directory.'
    ],
    examples: [
      'orca followup add --title "Chase DNS change with Ruan" --remind tomorrow',
      'orca followup add --title "Review nudge" --remind +2d --when-idle --pr https://github.com/unepwcmc/sapi/pull/42',
      'orca followup add --title "Finish runbook" --duration 120 --worktree current --priority high'
    ]
  },
  {
    path: ['followup', 'ls'],
    summary: 'List open follow-ups, most urgent first',
    usage: 'orca followup ls [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca followup ls']
  },
  {
    path: ['followup', 'snooze'],
    summary: 'Push a follow-up reminder to a later time',
    usage: 'orca followup snooze --id <id> --until <time> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'until'],
    notes: [TIME_NOTE, 'An id prefix of 8 or more characters is enough.'],
    examples: ['orca followup snooze --id 3f2a9c1b --until tomorrow']
  },
  {
    path: ['followup', 'done'],
    summary: 'Mark a follow-up done',
    usage: 'orca followup done --id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    examples: ['orca followup done --id 3f2a9c1b']
  },
  {
    path: ['followup', 'rm'],
    summary: 'Delete a follow-up',
    usage: 'orca followup rm --id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    examples: ['orca followup rm --id 3f2a9c1b']
  }
]
