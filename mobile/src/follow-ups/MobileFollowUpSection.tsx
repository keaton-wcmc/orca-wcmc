import { Fragment, useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { isFollowUpAwaitingUser } from '../../../src/shared/work-tasks/work-task-order'
import { describeWorkTaskLink } from '../../../src/shared/work-tasks/work-task-links'
import { parseWorkTaskTimeInput } from '../../../src/shared/work-tasks/work-task-time-input'
import type { WorkTask } from '../../../src/shared/work-tasks/work-task-types'
import { homeListStyles as styles } from '../home/home-list-styles'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useHostClient } from '../transport/connection/host-client-hooks'
import { hostStatusProbe } from '../transport/connection/host-status-probe-operations'
import type { HostProfile } from '../host-catalog/host-profile'
import {
  followUpDoneWrite,
  followUpListRead,
  followUpSnoozeWrite,
  hostSupportsFollowUps,
  selectFollowUpRows
} from './follow-up-operations'

const REFRESH_MS = 60_000

/** Follow-ups from the first connected desktop that has them; hidden otherwise. */
export function MobileFollowUpSection(props: { connectedHosts: HostProfile[] }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { client } = useHostClient(props.connectedHosts[0]?.id)
  const [rows, setRows] = useState<WorkTask[] | null>(null)

  const refresh = useCallback(async () => {
    if (!client) {
      setRows(null)
      return
    }
    try {
      const status = await hostStatusProbe.request(client).then(hostStatusProbe.interpret)
      if (!status.accepted || !hostSupportsFollowUps(status.value.capabilities)) {
        setRows(null)
        return
      }
      const list = await followUpListRead.request(client).then(followUpListRead.interpret)
      setRows(selectFollowUpRows(list.tasks))
    } catch {
      setRows(null)
    }
  }, [client])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  if (!client || !rows || rows.length === 0) {
    return null
  }

  const act = async (send: () => Promise<unknown>): Promise<void> => {
    try {
      await send()
    } finally {
      await refresh()
    }
  }
  const snooze = (task: WorkTask, input: string) => {
    const until = parseWorkTaskTimeInput(input, new Date())
    if (until) {
      void act(() =>
        followUpSnoozeWrite
          .request(client, { id: task.id, until })
          .then(followUpSnoozeWrite.interpret)
      )
    }
  }

  return (
    <>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionHeading}>{t('home.sections.followUps', 'Follow-ups')}</Text>
      </View>
      <View style={styles.group}>
        {rows.map((task, index) => {
          const due = isFollowUpAwaitingUser(task)
          const detail = [
            task.link ? describeWorkTaskLink(task.link) : null,
            task.remind ? new Date(task.remind.at).toLocaleString() : null
          ]
            .filter((part) => part !== null)
            .join(' · ')
          return (
            <Fragment key={task.id}>
              {index > 0 ? <View style={[styles.separator, styles.fullSeparator]} /> : null}
              <View style={styles.row}>
                <View style={styles.text}>
                  <Text style={styles.title} numberOfLines={2}>
                    {task.title}
                  </Text>
                  {detail ? (
                    <Text style={styles.detail} numberOfLines={1}>
                      {detail}
                    </Text>
                  ) : null}
                  {due ? (
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          void act(() =>
                            followUpDoneWrite
                              .request(client, { id: task.id })
                              .then(followUpDoneWrite.interpret)
                          )
                        }
                      >
                        <Text style={styles.actionLabel}>{t('followUps.done', 'Done')}</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => snooze(task, '+1h')}>
                        <Text style={styles.actionLabel}>
                          {t('followUps.snoozeHour', '1 hour')}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => snooze(task, 'tomorrow')}
                      >
                        <Text style={styles.actionLabel}>
                          {t('followUps.snoozeTomorrow', 'Tomorrow')}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            </Fragment>
          )
        })}
      </View>
    </>
  )
}
