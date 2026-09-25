/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { View, Text, ScrollView, StyleSheet, Share } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { Button, Card, Container, Divider, SectionTitle, SettingRow, Toggle } from "../components"
import { fontSizes, fonts, lineHeights } from "../styles/typography"
import { Share2, TriangleAlert } from "lucide-react-native"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import { buildSetupConfig, buildSetupLink, type SetupShareParts, type SetupShareSelection } from "../utils/setupLink"
import { DEFAULT_AUTH_CONFIG, type AuthConfig, type Geofence, type TrackingProfile } from "../types/global"
import { size, space } from "../constants"
import { useTranslation } from "../i18n/useTranslation"
// Handlers and memos use the non-hook t, so no dependency list carries it.
import { t as translate } from "../i18n/t"

type ShareCategory = keyof SetupShareSelection

export function ShareSetupScreen() {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { settings } = useTracking()

  const [auth, setAuth] = useState<AuthConfig>(DEFAULT_AUTH_CONFIG)
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [profiles, setProfiles] = useState<TrackingProfile[]>([])

  // Nothing selected by default - the user opts in.
  const [selection, setSelection] = useState<SetupShareSelection>({
    tracking: false,
    sync: false,
    api: false,
    credentials: false,
    geofences: false,
    profiles: false
  })

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [a, g, p] = await Promise.all([
          NativeLocationService.getAuthConfig(),
          NativeLocationService.getGeofences(),
          NativeLocationService.getProfiles()
        ])
        if (!active) return
        setAuth(a)
        setGeofences(g)
        setProfiles(p)
      } catch (err) {
        logger.error("[ShareSetup] Failed to load config:", err)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const parts: SetupShareParts = useMemo(
    () => ({ settings, auth, geofences, profiles }),
    [settings, auth, geofences, profiles]
  )

  const config = useMemo(() => buildSetupConfig(parts, selection), [parts, selection])
  const isEmpty = Object.keys(config).length === 0

  const hasCredentials = auth.authType !== "none" || Object.keys(auth.customHeaders).length > 0

  // The sensitive fields the credentials toggle would put in the link.
  const credentialFields = useMemo(() => {
    const fields: string[] = []
    if (auth.authType === "basic") {
      if (auth.username) fields.push(translate("share.cred.username"))
      if (auth.password) fields.push(translate("share.cred.password"))
    } else if (auth.authType === "bearer") {
      if (auth.bearerToken) fields.push(translate("share.cred.token"))
    }
    if (Object.keys(auth.customHeaders).length > 0) fields.push(translate("share.cred.headers"))
    return fields
  }, [auth])

  const toggle = useCallback((key: ShareCategory) => {
    setSelection((s) => ({ ...s, [key]: !s[key] }))
  }, [])

  const handleShare = useCallback(async () => {
    if (isEmpty) return
    try {
      await Share.share({ message: buildSetupLink(parts, selection) })
    } catch (err) {
      logger.error("[ShareSetup] Failed to share setup:", err)
      showAlert(translate("common.error"), translate("share.failed"), "error")
    }
  }, [parts, selection, isEmpty])

  const rows: { key: ShareCategory; label: string; sub: string; disabled?: boolean }[] = [
    { key: "tracking", label: t("share.tracking"), sub: t("share.tracking.sub") },
    { key: "sync", label: t("share.sync"), sub: t("share.sync.sub") },
    { key: "api", label: t("share.api"), sub: t("share.api.sub") },
    {
      key: "geofences",
      label: t("share.geofences"),
      sub:
        geofences.length > 0
          ? t("share.zones", { count: geofences.length, n: geofences.length })
          : t("share.noneSaved"),
      disabled: geofences.length === 0
    },
    {
      key: "profiles",
      label: t("share.profilesRow"),
      sub:
        profiles.length > 0
          ? t("share.profiles", { count: profiles.length, n: profiles.length })
          : t("share.noneSaved"),
      disabled: profiles.length === 0
    },
    {
      key: "credentials",
      label: t("share.credentials"),
      sub: hasCredentials ? t("share.credentials.sub") : t("share.noneConfigured"),
      disabled: !hasCredentials
    }
  ]

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("share.intro")}</Text>

        <View style={styles.section}>
          <SectionTitle>{t("share.include")}</SectionTitle>
          <Card rows>
            {rows.map((row, i) => (
              <React.Fragment key={row.key}>
                {i > 0 && <Divider tight />}
                <SettingRow label={row.label} hint={row.sub} disabled={row.disabled}>
                  <Toggle
                    accessibilityLabel={row.label}
                    testID={`share-${row.key}`}
                    value={selection[row.key] && !row.disabled}
                    onValueChange={() => toggle(row.key)}
                    disabled={row.disabled}
                  />
                </SettingRow>
              </React.Fragment>
            ))}
          </Card>
        </View>

        {selection.credentials && hasCredentials && credentialFields.length > 0 && (
          <View style={styles.section}>
            <Card danger>
              <View style={styles.headerRow}>
                <TriangleAlert size={size.icon.md} color={colors.error} />
                <Text style={[styles.warningText, { color: colors.text }]}>
                  {t("share.warning", { fields: credentialFields.join(", ") })}
                </Text>
              </View>
            </Card>
          </View>
        )}

        <View style={styles.actions}>
          <Button title={t("share.share")} onPress={handleShare} variant="primary" icon={Share2} disabled={isEmpty} />
          {isEmpty && <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>{t("share.empty")}</Text>}
        </View>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    paddingBottom: space.xxl
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md
  },
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.md
  },
  section: {
    marginTop: space.sm
  },
  warningText: {
    flex: 1,
    fontSize: fontSizes.caption,
    ...fonts.regular,
    lineHeight: lineHeights.caption
  },
  actions: {
    marginTop: space.xl
  },
  emptyHint: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    textAlign: "center",
    marginTop: space.sm
  }
})
