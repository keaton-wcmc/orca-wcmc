import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/mobile-theme'
import {
  getWorkspacePriorityEnglishLabel,
  type WorkspacePriority
} from '../../../src/shared/workspace-priority'

const ACTIVE_BARS: Record<Exclude<WorkspacePriority, 'urgent'>, number> = {
  high: 3,
  medium: 2,
  low: 1
}
const BAR_HEIGHTS = [4, 6.5, 9]

/** The desktop's priority glyph on the phone: an urgent tile, or three signal bars. */
export function WorkspacePriorityGlyph({ priority }: { priority: WorkspacePriority }) {
  const accessibilityLabel = `Priority: ${getWorkspacePriorityEnglishLabel(priority)}`
  if (priority === 'urgent') {
    return (
      <View style={styles.urgentTile} accessibilityLabel={accessibilityLabel}>
        <Text style={styles.urgentMark}>!</Text>
      </View>
    )
  }
  return (
    <View style={styles.bars} accessibilityLabel={accessibilityLabel}>
      {BAR_HEIGHTS.map((height, index) => (
        <View
          key={height}
          style={[
            styles.bar,
            { height },
            index < ACTIVE_BARS[priority] ? styles.barActive : styles.barInactive
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
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
  bars: {
    width: 12,
    height: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 1
  },
  bar: {
    width: 2.5,
    borderRadius: 1
  },
  barActive: {
    backgroundColor: colors.textSecondary
  },
  barInactive: {
    backgroundColor: colors.borderSubtle
  }
})
