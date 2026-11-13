# Work planning and follow-up reminders

**Status:** design approved in conversation 2026-11-13; awaiting review of this written spec.
**Branch:** `feat/work-planning`, based on `sync/20261106` (fork priority feature on upstream `a6c78e3de39`).
**Scope:** the `keaton-wcmc/orca-wcmc` fork only.

## Goal

Orca should plan the user's working day and make sure nothing they meant to chase is forgotten.
Three outcomes:

1. Any follow-up can be captured in one step and will reach the user at the right time, on the
   desk, on the phone, in Slack and in Outlook.
2. Work is placed into the user's Outlook calendar automatically, inside focus windows the user
   reserves, ordered by workspace priority.
3. When the day changes (a meeting lands, a task overruns), Orca proposes a re-plan instead of
   letting the calendar go stale.

## Decisions taken with the user

| Topic | Decision |
|---|---|
| What a follow-up attaches to | Any of: a workspace (git worktree or folder workspace) or agent, free text, an external item (GitHub PR, GitLab MR, Slack thread). |
| Delivery | Orca desktop notification, Orca phone push, Slack incoming webhook into a private channel, Outlook (Microsoft To Do item with a reminder). |
| Microsoft access | The user registers a Microsoft Entra app in the WCMC tenant with the m365 CLI; delegated permissions only. |
| Slack access | Incoming webhook only. Orca can post to Slack but cannot read it. |
| Unit of planning | A task. A workspace can generate a task. Workspace priority orders tasks. |
| Autonomy | Orca fills user-reserved "Orca" windows automatically. Anything outside those windows is a proposal the user accepts. |
| Architecture | Built into Orca's main process (approach 1 of 3). Rejected: Microsoft To Do as the store (no workspace links or conditions, slow, offline-hostile); a separate cloud service (holds a WCMC token off the laptop, against least-privilege policy). |

## Phases

Each phase ships on its own and is useful without the next.

1. **Tasks and reminders.** Task store, reminder service, desktop, phone and Slack delivery,
   Plan panel with the Due list, "Add follow-up" menu items, CLI, mobile list. No Microsoft.
2. **Microsoft.** Sign-in, the Outlook To Do mirror for fixed-time reminders, calendar read
   (busy times, Orca windows, working hours).
3. **Planner.** Day planner, automatic booking inside Orca windows, re-plan proposals,
   end-of-block check-in, read-only plan on the phone.

## Components

| Unit | Location | Responsibility |
|---|---|---|
| Task model | `src/shared/work-tasks/` | `WorkTask` type and validation. Shared by main, renderer, mobile and CLI. |
| Task store | `src/main/work-tasks/` | Persists tasks in Orca's user data, following the existing persistence store pattern. The only writer of tasks. Emits change events. |
| Graph client | `src/main/microsoft-graph/` | Browser sign-in (authorisation code with PKCE, loopback redirect), token refresh, calendar reads, event and To Do writes. |
| Day planner | `src/main/day-planner/` | Pure function from (windows, busy intervals, ordered tasks, now) to a list of blocks. No I/O. |
| Booking sync | `src/main/day-planner/` | Diffs desired blocks against Orca-owned Outlook events and applies the difference. |
| Reminder service | `src/main/follow-up-reminders/` | Next-due timer, wake catch-up, activity checks, dispatch to delivery channels. Modelled on `src/main/automations/service.ts`. |
| Slack delivery | `src/main/follow-up-reminders/` | Posts to the configured incoming webhook. |
| RPC and capability | `src/main/runtime/rpc/methods/`, `src/shared/rpc-contract/` | `workTasks.*` methods behind host capability `work-tasks.v1`. |
| Surfaces | renderer, `mobile/`, `src/cli/` | Plan panel, "Add follow-up" on workspace and PR context menus, `orca task add\|ls\|snooze\|done`, phone task list. |

### Task model

```ts
type WorkTaskLink =
  | { kind: 'worktree'; worktreeId: string }
  | { kind: 'folder'; workspaceId: string }
  | { kind: 'agent'; worktreeId: string; agentId: string }
  | { kind: 'pr'; repo: string; number: number }        // GitHub
  | { kind: 'mr'; project: string; iid: number }        // GitLab
  | { kind: 'slack'; url: string }

type WorkTask = {
  id: string
  title: string
  durationMin: number              // planning estimate; remaining time after an overrun
  priority?: 'urgent' | 'high' | 'medium' | 'low'   // falls back to the linked workspace's priority
  dueAt?: string                   // ISO UTC
  link?: WorkTaskLink
  remind?: { at: string; whenIdle: boolean }        // whenIdle: fire only if the link has not moved
  state: 'open' | 'snoozed' | 'done'
  createdAt: string
  outlook?: { todoTaskId?: string }
}
```

`whenIdle` is accepted only for `pr` and `mr` links. A Slack thread cannot be read through a
webhook, so Slack-linked reminders are time-only.

## Data flow

### Reminders

1. Saving a task with `remind` re-arms a single next-due timer across all tasks. When phase 2 is
   active and the reminder is fixed-time, Orca also creates a To Do item with that reminder time
   in a list named "Orca".
2. At the due time, for `whenIdle` reminders, Orca asks the existing GitHub or GitLab client for
   activity (commits, comments, review state) since `createdAt`. If the item moved, the reminder
   closes quietly and the Due list shows it as resolved with the reason.
3. Otherwise Orca delivers: desktop notification through `notification-delivery-service.ts`; a
   phone push when `desktop-away-state.ts` reports the user away; and a Slack post, always, as a
   lasting record.
4. On wake (Electron `powerMonitor` resume) or start, reminders that came due while asleep fire
   once, labelled "overdue since HH:MM". No repeats.
5. Notification actions: Done, Snooze (1 hour, tomorrow 09:00), Open. Done completes the task in
   Orca and the To Do item. Completing the To Do item flows back to Orca on the next poll.
6. Orca and Outlook may both notify for the same fixed-time reminder. Accepted: it is what
   covers the laptop-asleep case.

### Planner

1. Runs on the first wake after 07:00 on a working day, on any task change, when the calendar
   changes (polled every 5 minutes while Orca is running), and on demand ("Plan").
2. Inputs: Orca windows (Outlook events with the category "Orca"), other busy events, working
   hours and time zone from Outlook mailbox settings, and open tasks ordered by overdue, then
   priority, then due date, then age.
3. Inside windows, blocks are written automatically. Each block is an Outlook event shown as
   free (the window still holds the time as busy), category "Orca block", carrying a
   single-value extended property with the Orca task id. **Orca edits or deletes only events
   carrying that property.**
4. Tasks longer than the free gap are split into chunks of at least 30 minutes.
5. Outside windows, Orca only proposes, in the Plan panel: moving a block a meeting displaced, or
   booking extra time when tasks overflow the windows. Accepting writes a normal busy event,
   tagged the same way.
6. When a block ends, Orca asks: Done, 30 more minutes, 1 more hour. Unfinished tasks re-queue
   with the remaining estimate.

## Error handling

- **Expired sign-in:** silent refresh; on failure a "Reconnect Microsoft" banner in the Plan
  panel. Local reminders and Slack keep working.
- **Graph throttling or errors:** honour `Retry-After`. Booking is idempotent (diff, then apply
  only the difference), so a failed run retries on the next trigger without duplicates.
- **Offline:** plan from the last calendar snapshot, mark it "not booked", book on the next run
  that reaches Microsoft.
- **Slack webhook failure:** 3 retries, then Settings shows the channel as failing. Other
  channels still fire.
- **Activity check failure:** fire anyway, labelled "couldn't check activity".
- **Time:** stored in UTC; displayed in the Outlook mailbox time zone (falling back to the OS).

## Security

- Delegated Graph permissions only: `Calendars.ReadWrite`, `Tasks.ReadWrite`,
  `MailboxSettings.Read`, `User.Read`, `offline_access`. No application permissions.
- Tokens and the Slack webhook URL are encrypted through `src/main/host/safe-storage-availability.ts`.
  Where safe storage is unavailable, Orca refuses to persist them and asks for sign-in each launch.
- No task titles, calendar contents or webhook URLs in logs.

### One-off setup (user)

```bash
m365 entra app add --name "Orca fork - calendar and reminders" \
  --platform publicClient --redirectUris "http://localhost" \
  --apisDelegated "https://graph.microsoft.com/Calendars.ReadWrite,https://graph.microsoft.com/Tasks.ReadWrite,https://graph.microsoft.com/MailboxSettings.Read,https://graph.microsoft.com/User.Read,https://graph.microsoft.com/offline_access"
```

The resulting client id and the WCMC tenant id go into Orca settings. Neither is a secret.
The Slack webhook is created in a private channel and pasted into Orca settings.

Rollback: `m365 entra app remove --appId <id>` deletes the registration and revokes Orca's access.

## Compatibility

- **Remote:** tasks live on the desktop host; links to remote worktrees are by id. Phone and CLI
  check `work-tasks.v1` and hide the feature against hosts without it.
- **Mobile:** phase 1 list, add, snooze, done; phase 3 read-only plan for today.
- **Cross-platform:** HTTP and the existing notification service only; no native code. Loopback
  sign-in works on macOS, Windows and Linux.
- **Folder workspaces:** linkable like git worktrees; their priority feeds ordering.

## Testing

- Day planner: table-driven tests for ordering, splitting, a meeting colliding with a window, a
  full window, and a daylight-saving change day.
- Booking sync: against a fake Graph, assert only the difference is written and a rerun writes
  nothing.
- Reminder service: fake clock; wake catch-up; `whenIdle` skip and check-failure fallback.
- No tests for trivial wiring (`docs/reference/test-antipatterns.md`).

## Out of scope

Google Calendar; shared or team calendars; reading Slack; recurring tasks; natural-language
task entry.
