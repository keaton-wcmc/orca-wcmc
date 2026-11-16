import React, { useEffect, useState } from 'react'
import { isWorkspacePriority, WORKSPACE_PRIORITIES } from '../../../../shared/workspace-priority'
import {
  describeWorkTaskLink,
  parseMergeRequestUrl,
  parsePullRequestUrl
} from '../../../../shared/work-tasks/work-task-links'
import {
  parseWorkTaskTimeInput,
  WORK_TASK_TIME_INPUT_HINT
} from '../../../../shared/work-tasks/work-task-time-input'
import type { WorkTaskDraft, WorkTaskLink } from '../../../../shared/work-tasks/work-task-types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { useAddFollowUpDialog } from './add-follow-up-dialog-store'
import { workTasksClient } from './work-tasks-client'

const NO_PRIORITY = 'none'
const T = 'auto.components.plan.AddFollowUpDialog'

export function linkFromUrl(input: string): WorkTaskLink | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }
  if (/^https:\/\/[^/]*slack\.com\//.test(trimmed)) {
    return { kind: 'slack', url: trimmed }
  }
  return parsePullRequestUrl(trimmed) ?? parseMergeRequestUrl(trimmed)
}

function formatPreview(iso: string): string {
  return new Date(iso).toLocaleString(getIntlLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function AddFollowUpDialog(): React.JSX.Element {
  const { open, presetLink, onCreated, closeDialog } = useAddFollowUpDialog()
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState('30')
  const [remind, setRemind] = useState('')
  const [remindAt, setRemindAt] = useState<string | null>(null)
  const [whenIdle, setWhenIdle] = useState(false)
  const [priority, setPriority] = useState(NO_PRIORITY)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle('')
      setDuration('30')
      setRemind('')
      setRemindAt(null)
      setWhenIdle(false)
      setPriority(NO_PRIORITY)
      setUrl('')
      setError(null)
    }
  }, [open])

  const link = presetLink ?? linkFromUrl(url) ?? undefined
  const idleAllowed = link?.kind === 'pr' || link?.kind === 'mr'
  const durationMin = Number(duration)

  const submit = async (): Promise<void> => {
    if (!title.trim()) {
      setError(translate(`${T}.titleRequired`, 'Give the follow-up a title.'))
      return
    }
    if (remind && !remindAt) {
      setError(`${translate(`${T}.badTime`, 'Unrecognised time.')} ${WORK_TASK_TIME_INPUT_HINT}`)
      return
    }
    if (url.trim() && !presetLink && !link) {
      setError(translate(`${T}.badLink`, 'That link is not a PR, MR or Slack URL.'))
      return
    }
    const draft: WorkTaskDraft = {
      title: title.trim(),
      durationMin: Number.isInteger(durationMin) && durationMin > 0 ? durationMin : 30,
      ...(isWorkspacePriority(priority) ? { priority } : {}),
      ...(link ? { link } : {}),
      ...(remindAt ? { remind: { at: remindAt, whenIdle: whenIdle && idleAllowed } } : {})
    }
    setSaving(true)
    try {
      await workTasksClient.create(draft)
      onCreated?.()
      closeDialog()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : closeDialog())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate(`${T}.title`, 'Add follow-up')}</DialogTitle>
          <DialogDescription>
            {presetLink
              ? describeWorkTaskLink(presetLink)
              : translate(`${T}.description`, 'Orca reminds you on desktop, phone and Slack.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="follow-up-title">{translate(`${T}.titleLabel`, 'What')}</Label>
            <Input
              id="follow-up-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={translate(`${T}.titlePlaceholder`, 'Chase review on the DNS change')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="follow-up-remind">{translate(`${T}.remindLabel`, 'Remind me')}</Label>
            <Input
              id="follow-up-remind"
              value={remind}
              onChange={(event) => {
                const value = event.target.value
                setRemind(value)
                setRemindAt(value ? parseWorkTaskTimeInput(value, new Date()) : null)
              }}
              placeholder="+2h, tomorrow, fri 14:00"
            />
            <p className="text-xs text-muted-foreground">
              {remind
                ? remindAt
                  ? formatPreview(remindAt)
                  : WORK_TASK_TIME_INPUT_HINT
                : translate(`${T}.noReminder`, 'Leave empty for no reminder.')}
            </p>
          </div>
          {presetLink ? null : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="follow-up-link">
                {translate(`${T}.linkLabel`, 'Link (optional)')}
              </Label>
              <Input
                id="follow-up-link"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={translate(`${T}.linkPlaceholder`, 'PR, MR or Slack thread URL')}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="follow-up-idle"
              checked={whenIdle && idleAllowed}
              disabled={!idleAllowed || !remindAt}
              onCheckedChange={(checked) => setWhenIdle(checked === true)}
            />
            <Label htmlFor="follow-up-idle">
              {translate(`${T}.idleLabel`, 'Only if the PR or MR has not changed')}
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="follow-up-duration">
                {translate(`${T}.durationLabel`, 'Minutes of work')}
              </Label>
              <Input
                id="follow-up-duration"
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{translate(`${T}.priorityLabel`, 'Priority')}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRIORITY}>
                    {translate(`${T}.priorityNone`, 'From workspace')}
                  </SelectItem>
                  {WORKSPACE_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog}>
              {translate(`${T}.cancel`, 'Cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {translate(`${T}.save`, 'Add follow-up')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
