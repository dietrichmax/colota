/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native"
import { BatteryWarning, CircleAlert, TriangleAlert, type LucideIcon } from "lucide-react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../../hooks/useTheme"
import { fontSizes, fonts, lineHeights } from "../../../styles/typography"
import { elevation, size, space } from "../../../constants"
import { Button } from "../../ui/Button"
import { useTranslation } from "../../../i18n/useTranslation"
import type { TranslationKey } from "../../../i18n/options"

export type BannerCondition = "permission" | "background" | "locationOff" | "battery"

type Props = {
  condition: BannerCondition
  onAction: () => void
  top: number
  left: number
  right: number
  onLayout?: (event: LayoutChangeEvent) => void
}

const CONTENT: Record<
  BannerCondition,
  { icon: LucideIcon; tone: "error" | "warning"; textKey: TranslationKey; actionKey: TranslationKey | null }
> = {
  permission: { icon: CircleAlert, tone: "error", textKey: "banner.permission", actionKey: "banner.grant" },
  background: { icon: CircleAlert, tone: "error", textKey: "banner.background", actionKey: "banner.grant" },
  locationOff: { icon: TriangleAlert, tone: "warning", textKey: "banner.locationOff", actionKey: "banner.settings" },
  battery: { icon: BatteryWarning, tone: "error", textKey: "banner.battery", actionKey: null }
}

export function DashboardBanner({ condition, onAction, top, left, right, onLayout }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const { icon: Icon, tone, textKey, actionKey } = CONTENT[condition]

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      onLayout={onLayout}
      style={[styles.container, { top, left, right, backgroundColor: colors.surfaceRaised }]}
      testID="dashboard-banner"
    >
      <Icon size={size.icon.md} color={colors[tone]} />
      <Text style={[styles.text, { color: colors.text }]}>{t(textKey)}</Text>
      {actionKey !== null && (
        <Button title={t(actionKey)} variant="ghost" shape="rounded" color={colors.primary} onPress={onAction} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 1,
    minHeight: size.row,
    borderRadius: radius.md,
    elevation: elevation.floating,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingStart: space.lg,
    paddingEnd: space.sm,
    paddingVertical: space.xs
  },
  text: {
    flex: 1,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    ...fonts.medium
  }
})
