# Work Planning and Follow-up Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 of the spec: follow-ups that can be captured from desktop, CLI or phone and that reach the user on time through Orca notifications, phone push and Slack.

**Architecture:** A standalone JSON task store and a 60-second reminder tick in Orca's main process, exposed through new `workTask.*` runtime RPC methods behind capability `work-tasks.v1`. Desktop, CLI and mobile are thin clients of those methods. Everything lives in new files so future upstream syncs touch as little shared code as possible.

**Tech Stack:** TypeScript, Electron main process, Zod RPC contracts, React renderer with the shadcn primitives in `src/renderer/src/components/ui/`, React Native mobile, Vitest.

**Spec:** `docs/work-planning-reminders-design.md`

## Global Constraints

- Base branch `feat/work-planning` on `sync/20261106`. Commit per task; never push.
- Follow `AGENTS.md`: no vague file names, one-line comments only where code cannot say why, no type assertions except `as const` (others need a `SAFETY:` line), `docs/STYLEGUIDE.md` tokens for UI.
- User-facing words: the panel is **Plan**, an item is a **Follow-up**. "Task" is upstream's word for tracker items; do not use it in UI copy or CLI names. Code identifiers use `workTask` / `work-tasks`.
- Capability id: `work-tasks.v1`.
- Times are stored as ISO 8601 UTC strings; input like "tomorrow" is interpreted in the OS local time zone (Outlook time zone arrives in phase 2).
- Never log task titles, link URLs or the Slack webhook URL.
- Toolchain: Node 24 and pnpm are not on PATH on this Mac. Bootstrap as in the sync branch (Node 24.22.1 verified against `src/shared/node-runtime-pin.ts`, pnpm from `package.json` `packageManager`, `pnpm install --frozen-lockfile --ignore-pnpmfile`). About 42 root test files fail on clean `upstream/main` for environmental reasons; compare any failure against `upstream/main` before calling it a regression.
- Verification per task: `pnpm test <the task's test files>`, then `pnpm tc` and `pnpm run check:code-quality:changed` before the commit.

## Deviations from the spec (for the user to confirm)

1. **No Done/Snooze buttons on the notification itself.** Electron notification actions only work on macOS. Notifications go through upstream's existing `runtime.dispatchPluginNotification`, which reaches both desktop and phone with no new notification types. Done and Snooze live in the Plan page, the phone list and the CLI. Clicking the notification opens Orca.
2. **CLI is `orca followup`, not `orca task`,** because `orca orchestration task-*` already exists and "task" means tracker items in Orca.
3. **A 60-second tick instead of a single next-due timer.** It handles wake-up catch-up and clock changes with no special cases. Reminders are accurate to within a minute.
4. **PR and MR links carry their host** (`github.com` or `gitlab.internal.unep-wcmc.org`), so the activity check knows which `gh` or `glab` host to ask.

## Review Focus

1. **A corrupt or unreadable `work-tasks.json`** must never be overwritten with an empty list: the store refuses writes and the Plan page says why. Test in Task 2.
2. **Waking after hours asleep, or a reminder set in the past,** fires exactly once, labelled overdue. It does not fire again on later ticks. Test in Task 5.
3. **A slow `gh` or `glab` call that outlasts a tick** must not deliver the same reminder twice. Test in Task 5.
4. **A follow-up whose linked worktree has since been deleted** still fires, using its stored label. Test in Task 5.
5. **"tomorrow" and "+1d" on a daylight-saving change day** land at 09:00 local and exactly 24 hours later respectively. Test in Task 1.

---

## Phase 1

### Task 1: Follow-up model, ordering and time input

**Files:**

- Create: `src/shared/work-tasks/work-task-types.ts`, `src/shared/work-tasks/work-task-order.ts`, `src/shared/work-tasks/work-task-time-input.ts`, `src/shared/work-tasks/work-tasks-runtime-capability.ts`
- Test: `src/shared/work-tasks/work-task-order.test.ts`, `src/shared/work-tasks/work-task-time-input.test.ts`

**Interfaces:**

- Produces:

```ts
// work-task-types.ts — Zod schemas, with types inferred from them
type WorkTaskLink =
  | { kind: 'worktree'; worktreeId: string; label: string }
  | { kind: 'folder'; workspaceId: string; label: string }
  | { kind: 'agent'; worktreeId: string; agentId: string; label: string }
  | { kind: 'pr'; host: string; repo: string; number: number }      // repo = "owner/name"
  | { kind: 'mr'; host: string; project: string; iid: number }      // project = "group/name"
  | { kind: 'slack'; url: string }
type WorkTaskReminder = { at: string; whenIdle: boolean; firedAt?: string }
type WorkTaskResolution = { at: string; reason: 'link-moved' }
type WorkTask = {
  id: string; title: string; durationMin: number
  priority?: WorkspacePriority            // from src/shared/workspace-priority
  dueAt?: string; link?: WorkTaskLink; remind?: WorkTaskReminder
  state: 'open' | 'snoozed' | 'done'; resolution?: WorkTaskResolution
  createdAt: string; updatedAt: string
}
const workTaskSchema, workTaskLinkSchema   // zod; whenIdle allowed only when link.kind is 'pr' | 'mr'
type WorkTaskDraft = Omit<WorkTask, 'id' | 'state' | 'createdAt' | 'updatedAt' | 'resolution'>

// work-task-order.ts
function orderWorkTasks(tasks: WorkTask[], now: Date,
  linkedPriority: (link: WorkTaskLink) => WorkspacePriority | undefined): WorkTask[]
// keeps only state !== 'done'; order: overdue (dueAt < now) first, then priority
// urgent>high>medium>low>none (own priority wins over linked priority), then dueAt ascending
// (undefined last), then createdAt ascending.
function isReminderDue(task: WorkTask, now: Date): boolean
// remind set, remind.firedAt unset, state !== 'done', remind.at <= now

// work-task-time-input.ts
function parseWorkTaskTimeInput(input: string, now: Date): string | null
// accepts ISO 8601; "+<n>m|h|d"; "tomorrow" (09:00 local next day); "tomorrow HH:MM";
// "mon".."sun" (09:00 local next such weekday). Returns ISO UTC or null.

// work-tasks-runtime-capability.ts
export const WORK_TASKS_RUNTIME_CAPABILITY = 'work-tasks.v1' as const
```

- [ ] **Step 1: Write the failing tests.**
  - `orderWorkTasks`:
    - an overdue low-priority follow-up sorts before an urgent one that isn't overdue
    - own `priority: 'low'` beats linked priority `'urgent'`
    - a follow-up with no priority uses its linked worktree's priority
    - `done` follow-ups are dropped
    - two equal follow-ups order by `createdAt`
  - `isReminderDue`: false once `firedAt` is set, false when `done`, true when `at` equals `now`.
  - `parseWorkTaskTimeInput` with `TZ=Europe/London` set in the test:
    - `now = 2026-10-24T20:00:00Z`: "tomorrow" gives `2026-10-25T09:00:00.000Z`, because clocks went back that night
    - same `now`: "+1d" gives `2026-10-25T20:00:00.000Z`
    - "tomorrow 14:30" gives 14:30 local
    - "fri" gives the next Friday at 09:00 local
    - "garbage", "+0d" and "+-1h" give `null`
  - `workTaskSchema` rejects `whenIdle: true` with a `worktree` link.
- [ ] **Step 2: Run** `pnpm test src/shared/work-tasks`. Expected: FAIL, modules missing.
- [ ] **Step 3: Implement** the four files with the signatures above. Use the existing `WorkspacePriority` type rather than a new union.
- [ ] **Step 4: Run** `pnpm test src/shared/work-tasks`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(work-tasks): add follow-up model, ordering and time input`.

### Task 2: Follow-up store

**Files:**

- Create: `src/main/work-tasks/work-task-store.ts`
- Test: `src/main/work-tasks/work-task-store.test.ts`

**Interfaces:**

- Consumes: `WorkTask`, `WorkTaskDraft`, `workTaskSchema` (Task 1).
- Produces:

```ts
type WorkTaskStoreReadState = { ok: true } | { ok: false; error: 'unreadable' }
class WorkTaskStore {
  constructor(filePath: string, now?: () => Date, newId?: () => string)
  readState(): WorkTaskStoreReadState
  list(): WorkTask[] // all states, as stored
  get(id: string): WorkTask | undefined
  create(draft: WorkTaskDraft): WorkTask // state 'open', ids via crypto.randomUUID
  update(
    id: string,
    patch: Partial<WorkTaskDraft> & Pick<Partial<WorkTask>, 'state' | 'resolution'>
  ): WorkTask
  remove(id: string): void
  onChange(listener: () => void): () => void
}
```

- **File:** `<userData>/work-tasks.json`, shaped as `{ version: 1, tasks: WorkTask[] }`, written with `writeDurableSecureJsonFile` from `src/shared/secure-file.ts`.
- **Unreadable file:** if the file exists but can't be read or parsed, every write throws `WorkTaskStoreUnreadableError`. Same posture as `src/main/plugins/plugin-secrets-store.ts`.
- **Invalid rows:** rows that fail `workTaskSchema` are skipped on read and kept verbatim on write.

- [ ] **Step 1: Write the failing tests** (each in a temp directory):
  - create → list → reopen a new store on the same path, and the task round-trips
  - `update` bumps `updatedAt`
  - `update` and `remove` on an unknown id throw
  - `onChange` fires once per write
  - **Review Focus 1:** write `{not json` to the file, then `readState()` is `{ ok: false, error: 'unreadable' }`, `create` throws `WorkTaskStoreUnreadableError`, and the file bytes are unchanged afterwards
  - a stored row with an unknown `link.kind` survives an unrelated `create`
- [ ] **Step 2: Run** `pnpm test src/main/work-tasks/work-task-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `WorkTaskStore`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(work-tasks): persist follow-ups in a standalone store`.

### Task 3: Link activity check

**Files:**

- Create: `src/main/follow-up-reminders/link-activity-check.ts`
- Test: `src/main/follow-up-reminders/link-activity-check.test.ts`

**Interfaces:**

- Consumes: `WorkTaskLink` (Task 1); `ghExecFileAsync` from `src/main/git/command-runner/gh-exec-file.ts`; `glabExecFileAsync` from `src/main/gitlab/gl-utils.ts`.
- Produces:

```ts
type LinkActivity = 'moved' | 'idle' | 'unknown'
type LinkActivityExec = {
  gh: (args: string[]) => Promise<{ stdout: string }>
  glab: (args: string[]) => Promise<{ stdout: string }>
}
function checkLinkActivity(
  link: WorkTaskLink,
  since: string,
  exec?: LinkActivityExec
): Promise<LinkActivity>
```

- **PR:** `gh api --hostname <host> repos/<repo>/pulls/<number> --jq .updated_at`
- **MR:** `glab api --hostname <host> projects/<encodeURIComponent(project)>/merge_requests/<iid>`, reading `updated_at` from the JSON.
- **Result:** `moved` when `updated_at > since`; `unknown` on any error or a missing field; `idle` otherwise. Other link kinds return `unknown` without calling anything.

- [ ] **Step 1: Write the failing tests** with a fake `exec`:
  - a PR updated after `since` gives `moved`, and the args are exactly as above
  - an MR updated before `since` gives `idle`, and the project path is URL-encoded (`devops%2Fssh-mananger`)
  - `gh` rejects, giving `unknown`
  - a `worktree` link gives `unknown` and makes no exec call
- [ ] **Step 2: Run** `pnpm test src/main/follow-up-reminders/link-activity-check.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `checkLinkActivity`, defaulting `exec` to the real helpers.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(follow-ups): check whether a linked PR or MR moved`.

### Task 4: Slack webhook channel

**Files:**

- Create: `src/main/follow-up-reminders/slack-webhook-secret.ts`, `src/main/follow-up-reminders/slack-webhook-delivery.ts`
- Test: `src/main/follow-up-reminders/slack-webhook-delivery.test.ts`

**Interfaces:**

- Produces:

```ts
// slack-webhook-secret.ts — <userData>/follow-up-slack-webhook.json.enc, encrypted with guardedSafeStorage
type SlackWebhookStatus = {
  configured: boolean
  lastError?: string
  protection: SecretProtectionAssessment
}
class SlackWebhookSecret {
  constructor(filePath: string)
  read(): string | null
  write(url: string): void // throws unless url starts with https://hooks.slack.com/; refuses without OS encryption
  clear(): void
  status(): SlackWebhookStatus
  recordError(message: string | null): void
}
// slack-webhook-delivery.ts
function postSlackWebhook(
  url: string,
  text: string,
  fetchImpl?: typeof fetch,
  sleep?: (ms: number) => Promise<void>
): Promise<{ ok: boolean; error?: string }>
// POST {"text": text}; up to 3 attempts at 1s, 4s, 16s gaps on network errors, 429 or 5xx; no retry on other 4xx.
```

- Follow `src/main/plugins/plugin-secrets-store.ts`: use `assessSecretProtection`, `writeSecureFile`, and never fall back to plaintext.
- A returned `error` names the HTTP status only, never the URL.

- [ ] **Step 1: Write the failing tests:**
  - a 500, 500, 200 sequence gives `ok: true` after 3 calls
  - four 500s give `ok: false` after exactly 3 calls
  - a 404 gives a single call
  - the error string doesn't contain the URL
  - `SlackWebhookSecret.write('http://example.com')` throws
- [ ] **Step 2: Run** `pnpm test src/main/follow-up-reminders/slack-webhook-delivery.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(follow-ups): post reminders to a Slack webhook`.

### Task 5: Reminder service

**Files:**

- Create: `src/main/follow-up-reminders/follow-up-reminder-service.ts`, `src/main/follow-up-reminders/follow-up-reminder-copy.ts`
- Test: `src/main/follow-up-reminders/follow-up-reminder-service.test.ts`

**Interfaces:**

- Consumes: `WorkTaskStore` (Task 2), `isReminderDue` (Task 1), `checkLinkActivity` (Task 3), `postSlackWebhook` and `SlackWebhookSecret` (Task 4).
- Produces:

```ts
type FollowUpDelivery = {
  notify: (title: string, body: string) => Promise<void> | void // wired to runtime.dispatchPluginNotification
  slack: (text: string) => Promise<{ ok: boolean; error?: string }>
}
class FollowUpReminderService {
  constructor(deps: {
    store: WorkTaskStore
    delivery: FollowUpDelivery
    now: () => Date
    checkActivity?: typeof checkLinkActivity
    tickMs?: number /* 60_000 */
  })
  start(): void // interval tick + immediate tick; also ticks on powerMonitor 'resume' when given
  stop(): void
  tick(): Promise<void>
}
// follow-up-reminder-copy.ts
function followUpNotificationText(
  task: WorkTask,
  now: Date
): { title: string; body: string; slack: string }
// title = task.title; body = link label or "repo#n"/"project!iid", plus " · overdue since HH:MM" (local)
// when now - remind.at > 2 minutes; slack = ":alarm_clock: <title> — <body>"
```

- **Tick algorithm.** One tick at a time; a tick that starts while another is running returns at once.

  ```
  for each task where isReminderDue(task, now):
    claim it first: store.update(id, { remind: { ...remind, firedAt: now } })
    if remind.whenIdle:
      activity = checkActivity(link, task.createdAt)
      if activity is 'moved':
        store.update(id, { state: 'done', resolution: { at: now, reason: 'link-moved' } })
        continue
      ('unknown' falls through, and the body gets " · couldn't check activity")
    deliver: notify, then slack if a webhook is configured
    on Slack failure: SlackWebhookSecret.recordError
  ```

- Claiming before awaiting is what stops double delivery (Review Focus 3).
- A snoozed follow-up is a reminder with a later `at` and `firedAt` cleared, so it needs no special case here.

- [ ] **Step 1: Write the failing tests** (fake clock, in-memory store on a temp file, fake delivery):
  - a due reminder notifies once and sets `firedAt`
  - **Review Focus 2:** a reminder whose `at` is 6 hours in the past fires once, with a body containing "overdue since", and a second `tick()` delivers nothing
  - **Review Focus 3:** with `checkActivity` stalled on a promise you control, calling `tick()` twice then resolving gives exactly one delivery
  - `whenIdle` with `moved` gives no delivery, `state: 'done'` and `resolution.reason: 'link-moved'`
  - `whenIdle` with `unknown` delivers, with a body containing "couldn't check activity"
  - **Review Focus 4:** a `worktree` link whose worktree no longer exists still delivers, using `link.label`
  - a Slack failure records the error and the desktop notification still happens
- [ ] **Step 2: Run** `pnpm test src/main/follow-up-reminders/follow-up-reminder-service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(follow-ups): fire due reminders once, with idle checks`.

### Task 6: Runtime methods, capability and startup wiring

**Files:**

- Create: `src/shared/rpc-contract/work-task-params.ts`, `src/main/runtime/rpc/methods/work-tasks.ts`, `src/main/work-tasks/work-task-service-registry.ts`, `src/main/startup/main-process-work-tasks.ts`
- Modify:
  - `src/main/runtime/rpc/methods/index.ts`: spread `WORK_TASK_METHODS` next to `AUTOMATION_METHODS`
  - `src/shared/protocol-version.ts`: add `WORK_TASKS_RUNTIME_CAPABILITY` to the advertised list
  - `src/main/startup/main-process-ready-runtime.ts`: call `initializeMainProcessWorkTasks()` right after `initializeMainProcessAutomations()`
- Test: `src/main/runtime/rpc/methods/work-tasks.test.ts`

**Interfaces:**

- Consumes: Tasks 1, 2, 4 and 5.
- Produces RPC methods, all with `permission: 'workspace'`:

| Method                         | Params                  | Result                                                                                                                                             |
| ------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workTask.list`                | `{}`                    | `{ tasks: WorkTask[]; storeState: WorkTaskStoreReadState }` (ordered with `orderWorkTasks`, plus `done` tasks resolved in the last 24h at the end) |
| `workTask.create`              | `WorkTaskDraft`         | `{ task: WorkTask }`                                                                                                                               |
| `workTask.update`              | `{ id; patch }`         | `{ task: WorkTask }`                                                                                                                               |
| `workTask.snooze`              | `{ id; until: string }` | `{ task }`: sets `state: 'snoozed'`, `remind: { ...remind, at: until, firedAt: undefined }`                                                        |
| `workTask.done`                | `{ id }`                | `{ task }`                                                                                                                                         |
| `workTask.remove`              | `{ id }`                | `{}`                                                                                                                                               |
| `workTask.slackWebhook.status` | `{}`                    | `SlackWebhookStatus`                                                                                                                               |
| `workTask.slackWebhook.set`    | `{ url }`               | `SlackWebhookStatus`                                                                                                                               |
| `workTask.slackWebhook.clear`  | `{}`                    | `SlackWebhookStatus`                                                                                                                               |
| `workTask.slackWebhook.test`   | `{}`                    | `{ ok; error? }`                                                                                                                                   |

- **Service access:** `work-task-service-registry.ts` exports `setWorkTaskServices(services | null)` and `requireWorkTaskServices()`. The latter throws an RPC error, "Follow-ups live on the desktop app", when unset. This keeps the fork's changes out of `orca-runtime.ts`.
- **Startup:** `initializeMainProcessWorkTasks()` returns early when `mainProcessState.isServeMode`. Otherwise it builds the store and Slack secret under `app.getPath('userData')`, plus the service with `notify: (title, body) => runtime.dispatchPluginNotification({ pluginId: 'Follow-up', title, body })`. It ticks on Electron `powerMonitor.on('resume')`, then registers the services.
- **Linked priority** for ordering comes from the worktree or folder-workspace metadata the main process already holds. Reuse the lookup `worktree ps` uses in `runtime-worktree-ps-summaries.ts`, not a new one.

- [ ] **Step 1: Write the failing test:** with services registered on a temp store, call the handlers directly:
  - create two follow-ups (low, urgent) and check that `list` returns urgent first
  - `snooze` clears `firedAt`
  - `slackWebhook.set` with a non-Slack URL rejects
  - with no services registered, `list` rejects with "Follow-ups live on the desktop app"
  - `WORK_TASKS_RUNTIME_CAPABILITY` is in the advertised capability list
- [ ] **Step 2: Run** `pnpm test src/main/runtime/rpc/methods/work-tasks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the files and modifications above.
- [ ] **Step 4: Run** the same test, then `pnpm tc`. Expected: PASS, and typecheck clean.
- [ ] **Step 5: Commit** `feat(work-tasks): expose follow-ups over runtime RPC`.

### Task 7: CLI `orca followup`

**Files:**

- Create: `src/cli/specs/followup.ts`, `src/cli/handlers/followup.ts`
- Modify: `src/cli/specs/index.ts` (spread `FOLLOWUP_COMMAND_SPECS`); the handler registry that spreads `AUTOMATION_HANDLERS` (find it with `grep -rn AUTOMATION_HANDLERS src/cli`), to spread `FOLLOWUP_HANDLERS`; `src/cli/cli-command-names-parity.test.ts` expectations if it lists names.
- Test: `src/cli/handlers/followup.test.ts`

**Interfaces:**

- Consumes: the RPC methods (Task 6), `parseWorkTaskTimeInput` (Task 1), and `getOptionalWorktreeSelector` / `resolveCurrentWorktreeSelector` from `src/cli/selectors.ts`.
- Produces these commands. Every one accepts `--json`.

  ```
  orca followup add --title <text> [--duration <min, default 30>] [--remind <time>] [--when-idle]
                    [--due <time>] [--priority urgent|high|medium|low]
                    [--worktree <selector> | --pr <url> | --mr <url> | --slack <url>]
  orca followup ls [--all]
  orca followup snooze --id <id> --until <time>
  orca followup done --id <id>
  orca followup rm --id <id>
  ```

- `<time>` goes through `parseWorkTaskTimeInput`. An unparseable value exits non-zero with `Unrecognised time "<value>". Try +2h, tomorrow, tomorrow 14:00, fri, or an ISO date.`
- `--pr` and `--mr` URLs are parsed into `{ host, repo, number }` and `{ host, project, iid }`.
- `--when-idle` without `--pr` or `--mr` exits non-zero with `--when-idle needs --pr or --mr.`
- `ls` prints one line per follow-up: id (first 8 characters), remind time (local), title, link.

- [ ] **Step 1: Write the failing tests** against a fake runtime client:
  - `add --title x --remind +2h --pr https://github.com/unepwcmc/sapi/pull/42 --when-idle` sends `workTask.create` with `link { kind: 'pr', host: 'github.com', repo: 'unepwcmc/sapi', number: 42 }` and `remind.whenIdle: true`
  - an MR URL on `gitlab.internal.unep-wcmc.org` with a nested group parses its `project`
  - `--remind soon` errors with the message above
  - `--when-idle` alone errors
- [ ] **Step 2: Run** `pnpm test src/cli/handlers/followup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the spec and handlers.
- [ ] **Step 4: Run** the test file and `pnpm test src/cli/cli-command-names-parity.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cli): add orca followup`.

### Task 8: Desktop Plan page and "Add follow-up"

**Files:**

- Create:
  - `src/renderer/src/components/plan/PlanPage.tsx`: the Due list, the Upcoming list, and a Slack settings row
  - `src/renderer/src/components/plan/AddFollowUpDialog.tsx`
  - `src/renderer/src/components/plan/use-work-tasks.ts`
- Modify:
  - `src/renderer/src/store/slices/ui/ui-slice-contract-core.ts`: add `'plan'` to the view union, and add `previousViewBeforePlan`
  - `src/renderer/src/store/slices/ui/ui-slice-view-actions.ts`: add `openPlanPage` and `closePlanPage`, mirroring the automations actions
  - `src/renderer/src/app-shell/AppWorkspaceShell.tsx`: render `PlanPage` when `activeView === 'plan'`
  - `src/renderer/src/components/sidebar/SidebarNav.tsx`: add a Plan button next to Automations, with a count badge of due follow-ups
  - `src/renderer/src/components/sidebar/workspace-actions/context-menu/use-worktree-context-menu-commands.ts` and `WorktreeContextMenuView.tsx`: add an "Add follow-up…" item that opens the dialog, pre-linked to the worktree or folder workspace
  - `src/renderer/src/i18n/locales/en.json`: new strings
- Test: `src/renderer/src/components/plan/use-work-tasks.test.ts`

**Interfaces:**

- Consumes: the RPC methods (Task 6) through `callRuntimeRpc({ kind: 'local' }, …)` from `src/renderer/src/runtime/runtime-rpc-client.ts`, and `parseWorkTaskTimeInput` (Task 1).
- Produces:

```ts
function useWorkTasks(): {
  tasks: WorkTask[]
  storeState: WorkTaskStoreReadState
  dueCount: number
  refresh(): Promise<void>
  create(d: WorkTaskDraft): Promise<void>
  snooze(id: string, until: string): Promise<void>
  done(id: string): Promise<void>
  remove(id: string): Promise<void>
}
// fetches on mount, every 30s while mounted, and after each mutation
```

- **Due list:** each row shows title, link, and when it fired. Its actions are Done, Snooze (1 hour, tomorrow 09:00), and Open, which opens the linked worktree, or the PR, MR or Slack URL in the browser.
- **Resolved rows** are shown muted, with "Resolved: the PR moved".
- **Unreadable store:** when `storeState.ok === false`, show a destructive banner: "Follow-ups file can't be read; nothing will be saved until it's fixed." Include the file path.
- **Dialog fields:**
  - title
  - duration, default 30
  - remind-at, a free-text field using the same grammar as the CLI, with a live preview of the parsed local time
  - "only if nothing changed", enabled only for PR and MR links
  - priority
  - optional PR, MR or Slack URL when the dialog isn't opened from a workspace
- **Components:** use the shadcn `Dialog`, `Button`, `Input` and `Select` primitives, and the STYLEGUIDE tokens.

- [ ] **Step 1: Write the failing test** for `useWorkTasks` with a mocked `callRuntimeRpc`:
  - `dueCount` counts follow-ups with `firedAt` set and `state === 'open'`
  - `snooze` calls `workTask.snooze`, then refreshes
- [ ] **Step 2: Run** `pnpm test src/renderer/src/components/plan`. Expected: FAIL.
- [ ] **Step 3: Implement** the hook, page, dialog and wiring.
- [ ] **Step 4: Run** the test, `pnpm tc` and `pnpm run check:code-quality:changed`. Expected: PASS. Then check it visually: launch with `ORCA_BACKGROUND_LAUNCH=1` and take a CDP screenshot of the Plan page through the `$electron` skill (`AGENTS.md`), with one due, one upcoming and one resolved follow-up.
- [ ] **Step 5: Commit** `feat(plan): add the Plan page and Add follow-up`.

### Task 9: Phone follow-ups

**Files:**

- Create: `mobile/src/follow-ups/follow-up-operations.ts`, `mobile/src/follow-ups/MobileFollowUpSection.tsx`
- Modify: `mobile/src/home/tabs/MobileHomeFeedTab.tsx` (render the section at the top, only when the host advertises `work-tasks.v1`); `mobile/src/i18n/locales/en.json`
- Test: `mobile/src/follow-ups/follow-up-operations.test.ts`

**Interfaces:**

- Consumes: the RPC methods (Task 6) via `defineRpcOperation` / `bindDeferredRpcOperation`, following `mobile/src/automations/automation-operations.ts`; and `WORK_TASKS_RUNTIME_CAPABILITY`.
- Produces: `followUpListRead`, `followUpCreate`, `followUpSnooze` and `followUpDone` operations.
  - The section lists due items, then up to 5 upcoming items.
  - A swipe or tap menu offers Done, Snooze 1h and Snooze tomorrow.
  - A "+" opens a title + remind-at sheet using the same time grammar.

- [ ] **Step 1: Write the failing test:**
  - `followUpListRead` parses a `workTask.list` result
  - the section is hidden when the capability is missing (the selector function, not a render test)
- [ ] **Step 2: Run** `cd mobile && pnpm test src/follow-ups`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test and `cd mobile && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): list, add and snooze follow-ups`.

### Phase 1 exit check

- [ ] `pnpm tc`, mobile `pnpm typecheck`, `pnpm run check:code-quality:changed` against `sync/20261106`, and the test files from Tasks 1 to 9 all pass.
- [ ] End to end on a dev build with a copied profile (see the `orca-dev-live-profile` memory note):
  - `orca followup add --title "e2e" --remind +2m`, then wait. A desktop notification appears, and a Slack post appears if a webhook is set.
  - The Plan page shows the follow-up in Due. Done removes it.

---

## Phase 2: Microsoft

**Done before building (2026-11-18):** Entra app "Orca fork - calendar and reminders" registered with the m365 CLI. Single-tenant, public client, redirect `http://localhost`, delegated `Calendars.ReadWrite`, `Tasks.ReadWrite`, `MailboxSettings.Read`, `User.Read`, `offline_access`, no secret. The client id and tenant id live in local settings, not in code. Rollback: `m365 entra app remove --appId <id>`.

### Task 10: Sealed files and Microsoft settings

- Generalise the Slack secret's encryption into `src/main/microsoft-graph/sealed-json-file.ts` (`SealedJsonFile<T>`: `read(): T | null`, `write(value: T)`, `clear()`, refusing to write without the OS keychain). `SlackWebhookSecret` uses it. Existing Slack tests keep passing.
- `src/main/microsoft-graph/microsoft-graph-config.ts`: `{ clientId, tenantId }` as plain JSON in `<userData>/microsoft-graph.json`, validated as GUIDs.

### Task 11: Sign-in with PKCE on a loopback port

- `graph-pkce.ts` (pure): `createPkcePair()` gives a 43-128 character verifier and an S256 challenge. `buildAuthorizeUrl(config, redirectUri, challenge, state)` points at `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` with scopes `offline_access User.Read Calendars.ReadWrite Tasks.ReadWrite MailboxSettings.Read`.
- `graph-sign-in.ts`: starts an HTTP listener on `127.0.0.1:0`, opens the system browser at the authorise URL with `redirect_uri=http://localhost:<port>`, accepts exactly one callback whose `state` matches, and exchanges the code (with `code_verifier`, no secret) at the token endpoint. Times out after 5 minutes. The browser tab shows "You can close this tab".
- `graph-token-store.ts`: tokens `{ accessToken, refreshToken, expiresAt, account }` in a `SealedJsonFile`. `getAccessToken()` refreshes 2 minutes before expiry. On `invalid_grant` it clears the tokens and reports `reconnect-required`.
- Tests: the PKCE challenge equals the base64url SHA-256 of the verifier; the authorise URL carries every parameter; a refresh is sent only near expiry; `invalid_grant` leads to `reconnect-required`.

### Task 12: Graph client

- `graph-client.ts`: `request(method, path, body?)` adds the bearer token, retries once after refreshing on 401, honours `Retry-After` on 429 and 503 (up to 2 retries), and sends `Prefer: outlook.timezone="UTC"`.
- Methods: `me()`, `mailboxSettings()`, `calendarView(startIso, endIso)` (subject, start, end, showAs, categories, isAllDay, isCancelled), `todoLists()`, `createTodoList(name)`, `listTodoTasks(listId)`, `createTodoTask`, `updateTodoTask`, `deleteTodoTask`.
- Tests against a fake fetch: a 401 is refreshed then retried once; a 429 waits `Retry-After` seconds.

### Task 13: To Do mirror

- `outlook-todo-mirror.ts`: `reconcileTodoMirror(tasks, remote, client)`:
  - creates a To Do item, with `reminderDateTime` and `isReminderOn`, for each open fixed-time reminder that hasn't fired and has no `outlook.todoTaskId`
  - moves the reminder when the Orca time changed
  - completes the item when the Orca task is done
  - deletes items whose Orca task was removed
  - marks the Orca task done when the item was completed in To Do
  - `whenIdle` reminders are never mirrored
- Runs on store changes (debounced 5 seconds) and every 5 minutes while connected. Failures are logged and retried on the next run, and never block local reminders.
- Tests with a fake client: one create per new reminder; a rerun writes nothing; completion flows both ways; deletion.

### Task 14: Calendar read and Plan page

- `outlook-calendar.ts`: `readCalendarDay(client, day)` gives busy intervals (`showAs` busy, tentative or oof; not cancelled), Orca windows (category "Orca"), and working hours from mailbox settings. Cached, with a 5-minute refresh.
- RPC methods:
  - `workTask.microsoft.status` gives `{ configured, connected, account?, state: 'disconnected' | 'connected' | 'reconnect-required', lastError? }`
  - `workTask.microsoft.configure` takes `{ clientId, tenantId }`
  - `workTask.microsoft.connect` and `workTask.microsoft.disconnect`
  - `workTask.calendar.today`
- Plan page: a Microsoft card showing configure, connect, "Connected as …" or "Reconnect Microsoft", and a Today line: meetings count, Orca windows, and minutes free inside them.

## Phase 3: Planner (outline)

1. **`src/main/day-planner/plan-day.ts`:** the pure function `planDay(windows, busy, orderedTasks, now)`, which returns `PlannedBlock[]`. Chunks are at least 30 minutes. It's covered by the spec's table tests: ordering, splitting, a meeting colliding with a window, a full window, a DST day.
2. **`booking-sync.ts`:** compares the blocks it wants with the Orca-tagged events (single-value extended property holding the Orca task id), then creates, updates or deletes only the difference. Tests run against a fake Graph, including that a rerun writes nothing.
3. **Triggers:** first wake after 07:00 on a working day, a follow-up changing, the calendar poll, or the "Plan" button.
4. **Proposals:** displaced blocks and overflow appear as accept/dismiss cards in the Plan page. Accepting writes a busy event.
5. **End-of-block check-in** (Done / +30 min / +1 hour) through the same notification path, and a read-only "Today" plan on the phone.
