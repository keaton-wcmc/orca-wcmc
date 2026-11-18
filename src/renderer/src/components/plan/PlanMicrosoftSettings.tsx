import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { workTasksClient, type CalendarDay, type MicrosoftStatus } from './work-tasks-client'

const T = 'auto.components.plan.PlanMicrosoftSettings'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(getIntlLocale(), { hour: '2-digit', minute: '2-digit' })
}

export function describeCalendarDay(day: CalendarDay): string {
  const meetings = day.busy.length
  const windows = day.orcaWindows.map((w) => `${formatTime(w.start)}–${formatTime(w.end)}`)
  const parts = [
    meetings === 1 ? '1 meeting' : `${meetings} meetings`,
    windows.length === 0 ? 'no Orca windows' : `Orca windows ${windows.join(', ')}`
  ]
  if (windows.length > 0) {
    parts.push(`${day.freeMinutesInWindows} min free in them`)
  }
  return parts.join(' · ')
}

export function PlanMicrosoftSettings(): React.JSX.Element {
  const [status, setStatus] = useState<MicrosoftStatus | null>(null)
  const [day, setDay] = useState<CalendarDay | null>(null)
  const [clientId, setClientId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await workTasksClient.microsoftStatus()
      setStatus(next)
      setDay(next.state === 'connected' ? (await workTasksClient.calendarToday()).day : null)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (operation: () => Promise<MicrosoftStatus>): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      setStatus(await operation())
      await refresh()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="text-sm font-medium">{translate(`${T}.heading`, 'Microsoft 365')}</div>
      {!status?.configured ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => workTasksClient.configureMicrosoft({ clientId, tenantId }))
          }}
        >
          <p className="text-xs text-muted-foreground">
            {translate(
              `${T}.configureHint`,
              'Paste the client id and tenant id of the Entra app registered for Orca.'
            )}
          </p>
          <Input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client id"
          />
          <Input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="Tenant id"
          />
          <div>
            <Button type="submit" size="sm" disabled={busy || !clientId.trim() || !tenantId.trim()}>
              {translate(`${T}.save`, 'Save')}
            </Button>
          </div>
        </form>
      ) : status.state === 'connected' ? (
        <>
          <p className="text-xs text-muted-foreground">
            {translate(`${T}.connectedAs`, 'Connected as')} {status.account ?? ''}
            {' · '}
            {translate(
              `${T}.mirrorHint`,
              'Reminders also appear in the Orca list in Microsoft To Do.'
            )}
          </p>
          {day ? (
            <p className="text-sm">
              <span className="font-medium">{translate(`${T}.today`, 'Today')}:</span>{' '}
              {describeCalendarDay(day)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void workTasksClient
                  .calendarToday(true)
                  .then((result) => setDay(result.day))
                  .catch(() => {})
              }
            >
              {translate(`${T}.refresh`, 'Refresh calendar')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void run(workTasksClient.disconnectMicrosoft)}
            >
              {translate(`${T}.disconnect`, 'Disconnect')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {status.state === 'reconnect-required'
              ? translate(
                  `${T}.reconnectHint`,
                  'Microsoft sign-in expired. Reconnect to keep Outlook in step.'
                )
              : translate(
                  `${T}.connectHint`,
                  'Connect to mirror reminders into Microsoft To Do and read today’s calendar.'
                )}
          </p>
          <div>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run(workTasksClient.connectMicrosoft)}
            >
              {busy
                ? translate(`${T}.waiting`, 'Finish signing in in your browser…')
                : status.state === 'reconnect-required'
                  ? translate(`${T}.reconnect`, 'Reconnect Microsoft')
                  : translate(`${T}.connect`, 'Connect Microsoft')}
            </Button>
          </div>
        </>
      )}
      {status?.lastError ? <p className="text-xs text-destructive">{status.lastError}</p> : null}
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </section>
  )
}
