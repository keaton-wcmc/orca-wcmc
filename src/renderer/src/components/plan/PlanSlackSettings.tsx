import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { workTasksClient, type SlackWebhookStatus } from './work-tasks-client'

const T = 'auto.components.plan.PlanSlackSettings'

export function PlanSlackSettings(): React.JSX.Element {
  const [status, setStatus] = useState<SlackWebhookStatus | null>(null)
  const [url, setUrl] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void workTasksClient
      .slackStatus()
      .then(setStatus)
      .catch(() => {})
  }, [])

  const run = async (operation: () => Promise<SlackWebhookStatus>): Promise<void> => {
    try {
      setStatus(await operation())
      setMessage(null)
      setUrl('')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const test = async (): Promise<void> => {
    const result = await workTasksClient.testSlack()
    setMessage(
      result.ok
        ? translate(`${T}.testOk`, 'Posted a test message.')
        : (result.error ?? translate(`${T}.testFailed`, 'Slack test failed.'))
    )
    setStatus(await workTasksClient.slackStatus())
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="text-sm font-medium">{translate(`${T}.heading`, 'Slack')}</div>
      <p className="text-xs text-muted-foreground">
        {status?.configured
          ? translate(`${T}.configured`, 'Reminders also post to your Slack webhook.')
          : translate(
              `${T}.notConfigured`,
              'Paste an incoming webhook URL for a private channel to get reminders in Slack.'
            )}
      </p>
      {status && !status.encryptionAvailable ? (
        <p className="text-xs text-destructive">
          {translate(
            `${T}.noKeychain`,
            'The OS keychain is unavailable, so the webhook cannot be stored.'
          )}
        </p>
      ) : null}
      {status?.lastError ? <p className="text-xs text-destructive">{status.lastError}</p> : null}
      {status?.configured ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void test()}>
            {translate(`${T}.test`, 'Send test')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void run(workTasksClient.clearSlack)}>
            {translate(`${T}.remove`, 'Remove webhook')}
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => workTasksClient.setSlack(url))
          }}
        >
          <Input
            type="password"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://hooks.slack.com/services/..."
          />
          <Button type="submit" size="sm" disabled={!url.trim()}>
            {translate(`${T}.save`, 'Save')}
          </Button>
        </form>
      )}
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </section>
  )
}
