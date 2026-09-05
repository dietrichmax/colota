/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View } from "react-native"
import { Circle, CircleCheckBig } from "lucide-react-native"
import { Settings } from "../../../types/global"
import { useTracking } from "../../../contexts/TrackingProvider"
import { useTranslation } from "../../../i18n/useTranslation"
import { SectionTitle } from "../../ui/SectionTitle"
import { ListItem } from "../../ui/ListItem"

interface WelcomeCardProps {
  settings: Settings
  tracking: boolean
  onDismiss: () => void
  onStartTracking: () => void
  onNavigateToConnection: () => void
  onNavigateToTrackingSync: () => void
  onNavigateToApiConfig: () => void
}

/** First run only: a headed checklist on the sheet, the check state carried by the glyph. */
export function WelcomeCard({
  settings,
  tracking,
  onDismiss,
  onStartTracking,
  onNavigateToConnection,
  onNavigateToTrackingSync,
  onNavigateToApiConfig
}: WelcomeCardProps) {
  const {
    settings: { isOfflineMode }
  } = useTracking()
  const { t } = useTranslation()
  const hasEndpoint = settings.endpoint.trim().length > 0

  return (
    <View testID="welcome-card">
      <SectionTitle
        first
        action={{ label: t("dashboard.welcome.dismiss"), onPress: onDismiss, testID: "welcome-dismiss-btn" }}
      >
        {t("dashboard.welcome")}
      </SectionTitle>

      <ListItem
        testID="welcome-start-tracking"
        icon={tracking ? CircleCheckBig : Circle}
        label={t("dashboard.welcome.startTracking")}
        onPress={tracking ? undefined : onStartTracking}
        divider
      />
      {!isOfflineMode && (
        <ListItem
          testID="welcome-endpoint"
          icon={hasEndpoint ? CircleCheckBig : Circle}
          label={t("dashboard.welcome.endpoint")}
          onPress={hasEndpoint ? undefined : onNavigateToConnection}
          divider
        />
      )}
      {!isOfflineMode && (
        <ListItem
          testID="welcome-api-mapping"
          label={t("dashboard.welcome.apiMapping")}
          onPress={onNavigateToApiConfig}
          divider
        />
      )}
      <ListItem testID="welcome-presets" label={t("dashboard.welcome.presets")} onPress={onNavigateToTrackingSync} />
    </View>
  )
}
