/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback } from "react"
import { Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native"
import { Code, ExternalLink, FileText, ScrollText } from "lucide-react-native"
import { radius } from "@colota/shared"
import { Card, Container, Divider, ListItem, SectionTitle } from "../components"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import { buildLine } from "../utils/settingsRow"
import { fonts, fontSizes, lineHeights, type } from "../styles/typography"
import { PRIVACY_POLICY_URL, REPO_URL, space } from "../constants"
import icon from "../assets/icons/icon.png"
import type { ScreenProps } from "../types/global"

export function AboutScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const build = NativeLocationService.getBuildConfig()

  const openURL = useCallback((url: string) => {
    Linking.openURL(url).catch((err) => {
      logger.error("[AboutScreen] Failed to open URL:", err)
      showAlert("Error", "Could not open the link.", "error")
    })
  }, [])

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.identity}>
          <View style={styles.appIconContainer}>
            <Image source={icon} style={styles.appIcon} resizeMode="contain" />
          </View>
          <Text style={[styles.name, { color: colors.text }]}>Colota</Text>
          <Text style={[styles.version, { color: colors.textSecondary }]} testID="about-version">
            Version {buildLine(build)}
          </Text>
        </View>

        <View style={styles.section}>
          <SectionTitle>Legal</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-privacy-policy"
              icon={FileText}
              label="Privacy policy"
              sub="colota.app/privacy-policy"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openURL(PRIVACY_POLICY_URL)}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-license"
              icon={ScrollText}
              label="License"
              sub="GNU AGPLv3"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openURL(`${REPO_URL}/blob/main/LICENSE`)}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-source-code"
              icon={Code}
              label="Source code"
              sub="github.com/dietrichmax/colota"
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openURL(REPO_URL)}
            />
          </Card>
          <Text style={[styles.copyright, { color: colors.textLight }]}>
            Copyright &copy; 2026 Max Dietrich and contributors. Colota is free software, with no warranty; the License
            row above has the terms.
          </Text>
        </View>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  identity: {
    alignItems: "center",
    marginTop: space.lg,
    marginBottom: space.xl
  },
  appIconContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
    overflow: "hidden"
  },
  appIcon: {
    width: 80,
    height: 80
  },
  name: {
    ...type.display,
    marginBottom: space.xs
  },
  version: {
    fontSize: fontSizes.description,
    ...fonts.regular
  },
  section: {
    marginBottom: space.xl
  },
  copyright: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    lineHeight: lineHeights.caption,
    marginTop: space.lg
  }
})
