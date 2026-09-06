/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback } from "react"
import { View, Text, StyleSheet, ScrollView, Linking } from "react-native"
import { ExternalLink, FileText, Map, ScrollText, Code } from "lucide-react-native"
import { ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { Card, Container, Divider, ListItem, SectionTitle } from "../components"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import { fontSizes, fonts } from "../styles/typography"
import { space, OSM_COPYRIGHT_URL, PRIVACY_POLICY_URL, REPO_URL, TILE_SERVER_DOCS_URL } from "../constants"

export function LegalScreen({}: ScreenProps) {
  const { colors } = useTheme()

  const openURL = useCallback((url: string) => {
    Linking.openURL(url).catch((err) => {
      logger.error("[LegalScreen] Failed to open URL:", err)
      showAlert("Error", "Could not open the link.", "error")
    })
  }, [])

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SectionTitle>Colota</SectionTitle>
        <Card rows>
          <ListItem
            label="Privacy policy"
            sub="What the app stores, and what it never sends"
            icon={FileText}
            trailingIcon={ExternalLink}
            accessibilityRole="link"
            onPress={() => openURL(PRIVACY_POLICY_URL)}
          />
          <Divider tight inset />
          <ListItem
            label="License"
            sub="GNU AGPLv3"
            icon={ScrollText}
            trailingIcon={ExternalLink}
            accessibilityRole="link"
            onPress={() => openURL(`${REPO_URL}/blob/main/LICENSE`)}
          />
          <Divider tight inset />
          <ListItem
            label="Source code"
            sub="github.com/dietrichmax/colota"
            icon={Code}
            trailingIcon={ExternalLink}
            accessibilityRole="link"
            onPress={() => openURL(REPO_URL)}
          />
        </Card>

        <View style={styles.section}>
          <SectionTitle>Map data</SectionTitle>
    <Card rows>
            <ListItem
              label="OpenStreetMap"
              sub="Map data by OpenStreetMap contributors, ODbL"
              icon={Map}
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openURL(OSM_COPYRIGHT_URL)}
            />
            <Divider tight inset />
            <ListItem
              label="Colota tiles"
              sub="Self-hosted tile server - configure your own"
              icon={Map}
              trailingIcon={ExternalLink}
              accessibilityRole="link"
              onPress={() => openURL(TILE_SERVER_DOCS_URL)}
            />
          </Card>
        </View>

        <Text style={[styles.copyright, { color: colors.textLight }]}>
          Copyright &copy; 2026 Max Dietrich and contributors. Colota is free software, with no warranty; the License
          row above has the terms.
        </Text>
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
  section: {
    marginTop: space.xxl
  },
  copyright: {
    fontSize: fontSizes.caption,
    ...fonts.regular,
    lineHeight: 17,
    marginTop: space.xxl
  }
})
