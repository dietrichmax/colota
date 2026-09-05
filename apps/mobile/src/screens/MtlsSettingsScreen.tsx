/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, ScrollView } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { fontSizes, fonts } from "../styles/typography"
import { Container } from "../components"
import { MtlsSection } from "../components/features/settings/MtlsSection"
import { space } from "../constants"

export function MtlsSettingsScreen({}: ScreenProps) {
  const { colors } = useTheme()

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            For endpoints behind a reverse proxy that requires mutual TLS authentication
          </Text>
        </View>

        <MtlsSection />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: 40
  },
  header: {
    marginBottom: 20
  },
  subtitle: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: 20
  }
})
