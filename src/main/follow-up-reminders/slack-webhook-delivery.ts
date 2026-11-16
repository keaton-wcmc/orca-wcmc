const RETRY_DELAYS_MS = [1_000, 4_000] as const
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

export type SlackWebhookResult = { ok: boolean; error?: string }

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Posts once with up to 3 attempts; errors name the status only, never the secret URL. */
export async function postSlackWebhook(
  url: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<SlackWebhookResult> {
  let error = 'Slack webhook failed'
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1])
    }
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (response.ok) {
        return { ok: true }
      }
      error = `Slack webhook returned HTTP ${response.status}`
      if (response.status !== 429 && response.status < 500) {
        return { ok: false, error }
      }
    } catch {
      error = 'Slack webhook could not be reached'
    }
  }
  return { ok: false, error }
}
