import React, { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { isFollowUpAwaitingUser } from '../../../../shared/work-tasks/work-task-order'
import type { WorkTask } from '../../../../shared/work-tasks/work-task-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useAddFollowUpDialog } from './add-follow-up-dialog-store'
import { PlanFollowUpRow } from './PlanFollowUpRow'
import { PlanSlackSettings } from './PlanSlackSettings'
import { useWorkTasks, type UseWorkTasks } from './use-work-tasks'

const T = 'auto.components.plan.PlanPage'

function FollowUpSection({
  heading,
  empty,
  tasks,
  model
}: {
  heading: string
  empty: string
  tasks: WorkTask[]
  model: UseWorkTasks
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading} <span className="font-normal">{tasks.length || ''}</span>
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <PlanFollowUpRow
              key={task.id}
              task={task}
              onDone={() => void model.done(task.id)}
              onSnooze={(until) => void model.snooze(task.id, until)}
              onRemove={() => void model.remove(task.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export default function PlanPage(): React.JSX.Element {
  const closePage = useAppStore((state) => state.closePlanPage)
  const openDialog = useAddFollowUpDialog((state) => state.openDialog)
  const model = useWorkTasks()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !event.defaultPrevented && event.target === document.body) {
        closePage()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePage])

  const due = model.tasks.filter(isFollowUpAwaitingUser)
  const resolved = model.tasks.filter((task) => task.resolution !== undefined)
  const upcoming = model.tasks.filter(
    (task) =>
      !isFollowUpAwaitingUser(task) && task.resolution === undefined && task.state !== 'done'
  )

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 items-center gap-2 px-3 pb-3 md:px-5"
        // Keep the title clear of Windows/Linux window controls, as other pages do.
        style={{ paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))' }}
      >
        <h1 className="flex-1 truncate text-base font-semibold leading-8">
          {translate(`${T}.title`, 'Plan')}
        </h1>
        <Button size="sm" onClick={() => openDialog({ onCreated: model.refresh })}>
          <Plus className="size-3.5" />
          {translate(`${T}.add`, 'Add follow-up')}
        </Button>
      </header>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-6 md:px-5">
        {!model.storeState.ok ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {translate(
              `${T}.unreadable`,
              "The follow-ups file can't be read, so nothing will be saved until it is fixed:"
            )}{' '}
            <code className="break-all">{model.storePath}</code>
          </p>
        ) : null}
        {model.error ? <p className="text-sm text-destructive">{model.error}</p> : null}
        <FollowUpSection
          heading={translate(`${T}.due`, 'Due')}
          empty={translate(`${T}.dueEmpty`, 'Nothing waiting on you.')}
          tasks={due}
          model={model}
        />
        <FollowUpSection
          heading={translate(`${T}.upcoming`, 'Upcoming')}
          empty={translate(`${T}.upcomingEmpty`, 'No follow-ups planned.')}
          tasks={upcoming}
          model={model}
        />
        {resolved.length > 0 ? (
          <FollowUpSection
            heading={translate(`${T}.resolved`, 'Resolved on their own')}
            empty=""
            tasks={resolved}
            model={model}
          />
        ) : null}
        <PlanSlackSettings />
      </div>
    </main>
  )
}
