import { CalendarClock, CircleDot, GitMerge, SquareTerminal, StickyNote } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { colors } from '../../theme/mobile-theme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { TaskProviderLogo } from '../../components/icons/TaskProviderLogo'
import type { WorktreeMetaGlyphPresence } from './worktree-meta-glyph-presence'
import { prStateToken } from '../../source-control/review/status/pr-state-token'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import {
  getWorkspacePriority,
  getWorkspacePriorityEnglishLabel,
  type WorkspacePriority
} from '../../../../src/shared/workspace-priority'
import { statusColor } from '../../source-control/review/status/pr-sidebar-status-color'

// Use shared prStateToken to match sidebar badge: merged purple, open green, closed red, draft/unknown muted.
export function prStateColor(state: string): string {
  return statusColor(prStateToken(state))
}

// Match desktop metadata order; mobile glyphs show presence, with full details reserved for sheet.
export function WorktreeMetaGlyphs({ presence }: { presence: WorktreeMetaGlyphPresence }) {
  useMobileColorScheme()
  if (!Object.values(presence).some(Boolean)) {
    return null
  }
  return (
    <View style={styles.metaGlyphs}>
      {presence.notes && <StickyNote size={11} color={colors.textMuted} />}
      {presence.automation && <CalendarClock size={11} color={colors.textMuted} />}
      {presence.cli && <SquareTerminal size={11} color={colors.textMuted} />}
      {presence.issue && <CircleDot size={11} color={colors.textMuted} />}
      {presence.jira && <TaskProviderLogo provider="jira" size={10} color={colors.textMuted} />}
      {presence.linear && <Text style={styles.linearGlyph}>L</Text>}
      {presence.gitLabMR && <GitMerge size={11} color={colors.textMuted} />}
    </View>
  )
}

const ACTIVE_PRIORITY_BARS: Record<Exclude<WorkspacePriority, 'urgent'>, number> = {
  high: 3,
  medium: 2,
  low: 1
}
const PRIORITY_BAR_HEIGHTS = [4, 6.5, 9]

/** The desktop's priority glyph on the phone: an urgent tile, or three signal bars. */
export function WorkspacePriorityGlyph({ row }: { row: { priority?: WorkspacePriority | null } }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const priority = getWorkspacePriority(row)
  if (!priority) {
    return null
  }
  const accessibilityLabel = t('components.workspacePriorityGlyph.label', 'Priority: {{level}}', {
    level: getWorkspacePriorityEnglishLabel(priority)
  })
  if (priority === 'urgent') {
    return (
      <View style={styles.urgentTile} accessibilityLabel={accessibilityLabel}>
        <Text style={styles.urgentMark}>!</Text>
      </View>
    )
  }
  return (
    <View style={styles.priorityBars} accessibilityLabel={accessibilityLabel}>
      {PRIORITY_BAR_HEIGHTS.map((height, index) => (
        <View
          key={height}
          style={[
            styles.priorityBar,
            { height },
            index < ACTIVE_PRIORITY_BARS[priority]
              ? styles.priorityBarActive
              : styles.priorityBarInactive
          ]}
        />
      ))}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  metaGlyphs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 2
  },
  linearGlyph: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted
  },
  urgentTile: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.statusRed,
    alignItems: 'center',
    justifyContent: 'center'
  },
  urgentMark: {
    color: colors.onAccent,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11
  },
  priorityBars: {
    width: 12,
    height: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 1
  },
  priorityBar: {
    width: 2.5,
    borderRadius: 1
  },
  priorityBarActive: {
    backgroundColor: colors.textSecondary
  },
  priorityBarInactive: {
    backgroundColor: colors.borderSubtle
  }
}))
