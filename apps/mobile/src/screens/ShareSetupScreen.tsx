/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { View, Text, ScrollView, StyleSheet, Share } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking } from "../contexts/TrackingProvider"
import { Button, Card, Container, SectionTitle, Toggle } from "../components"
import { fontSizes, fonts } from "../styles/typography"
import { Share2, TriangleAlert } from "lucide-react-native"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import { buildSetupConfig, buildSetupLink, type SetupShareParts, type SetupShareSelection } from "../utils/setupLink"
import { DEFAULT_AUTH_CONFIG, type AuthConfig, type Geofence, type TrackingProfile } from "../types/global"
import { size, space } from "../constants"

type ShareCategory = keyof SetupShareSelection

export function ShareSetupScreen() {
  const { colors } = useTheme()
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
      if (auth.username) fields.push("username")
      if (auth.password) fields.push("password")
    } else if (auth.authType === "bearer") {
      if (auth.bearerToken) fields.push("bearer token")
    }
    if (Object.keys(auth.customHeaders).length > 0) fields.push("custom headers")
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
      showAlert("Error", "Failed to share setup.", "error")
    }
  }, [parts, selection, isEmpty])

  const rows: { key: ShareCategory; label: string; sub: string; disabled?: boolean }[] = [
    { key: "tracking", label: "Tracking", sub: "GPS interval, distance and accuracy filter" },
    { key: "sync", label: "Sync", sub: "Sync interval, conditions and offline mode" },
    { key: "api", label: "API", sub: "Endpoint, template and field mapping" },
    {
      key: "geofences",
      label: "Geofences",
      sub: geofences.length > 0 ? `${geofences.length} zone${geofences.length === 1 ? "" : "s"}` : "None saved",
      disabled: geofences.length === 0
    },
    {
      key: "profiles",
      label: "Tracking profiles",
      sub: profiles.length > 0 ? `${profiles.length} profile${profiles.length === 1 ? "" : "s"}` : "None saved",
      disabled: profiles.length === 0
    },
    {
      key: "credentials",
      label: "Credentials",
      sub: hasCredentials ? "Authentication secrets - included only if checked" : "None configured",
      disabled: !hasCredentials
    }
  ]

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Share2 size={28} color={colors.primary} />
            <View style={styles.headerText}>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Choose what to bundle into a setup link, then share it. The recipient opens it to apply the same
                configuration.
              </Text>
            </View>
          </View>
        </Card>

        <View style={styles.section}>
          <SectionTitle>INCLUDE</SectionTitle>
          <Card>
            {rows.map((row, i) => (
              <View
                key={row.key}
                style={[
                  styles.row,
                  i < rows.length - 1 && styles.rowBorder,
                  i < rows.length - 1 && { borderBottomColor: colors.border }
                ]}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: row.disabled ? colors.textSecondary : colors.text }]}>
                    {row.label}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{row.sub}</Text>
                </View>
                <Toggle
                  accessibilityLabel={row.label}
                  testID={`share-${row.key}`}
                  value={selection[row.key] && !row.disabled}
                  onValueChange={() => toggle(row.key)}
                  disabled={row.disabled}
                />
              </View>
            ))}
          </Card>
        </View>

        {selection.credentials && hasCredentials && credentialFields.length > 0 && (
          <View style={styles.section}>
            <Card style={[styles.warningCard, { borderColor: colors.error }]}>
              <View style={styles.headerRow}>
                <TriangleAlert size={size.icon.md} color={colors.error} />
                <Text style={[styles.warningText, { color: colors.text }]}>
                  This link will contain your {credentialFields.join(", ")} in plain text. Anyone who sees the link can
                  read them - only share it over a trusted channel.
                </Text>
              </View>
            </Card>
          </View>
        )}

        <View style={styles.actions}>
          <Button title="Share" onPress={handleShare} variant="primary" icon={Share2} disabled={isEmpty} />
          {isEmpty && (
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              Select at least one category to share.
            </Text>
          )}
        </View>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    paddingBottom: 40
  },
  headerCard: {
    marginBottom: space.lg
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md
  },
  headerText: {
    flex: 1
  },
  subtitle: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginTop: 2
  },
  section: {
    marginTop: space.sm
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    gap: space.md
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  rowText: {
    flex: 1
  },
  rowLabel: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  rowSub: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    marginTop: 2
  },
  warningCard: {
    borderWidth: StyleSheet.hairlineWidth
  },
  warningText: {
    flex: 1,
    fontSize: fontSizes.caption,
    ...fonts.regular,
    lineHeight: 17
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
