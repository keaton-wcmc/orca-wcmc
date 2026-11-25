import type React from 'react'
import type { GlobalSettings } from '../../../../shared/settings/global-settings-types'
import { SettingsSwitchRow } from '../settings/form-controls/SettingsFormControls'
import { SearchableSetting } from '../settings/section-layout/SearchableSetting'
import { useTranslate } from '@/i18n/use-translate'

/** Appearance switch for the Plan page's sidebar and rail button. */
export function PlanButtonSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const label = t('auto.components.plan.settings.showPlanButton', 'Show Plan button')
  return (
    <SearchableSetting title={label} keywords={['plan', 'follow-up', 'reminder', 'calendar']}>
      <SettingsSwitchRow
        label={label}
        checked={settings.showPlanButton !== false}
        onChange={() => updateSettings({ showPlanButton: !(settings.showPlanButton !== false) })}
      />
    </SearchableSetting>
  )
}
