/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, ScrollView } from "react-native"
import { ScreenProps } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { text } from "../styles/typography"
import { space } from "../constants"
import { Container } from "../components"
import { MtlsSection } from "../components/features/settings/MtlsSection"

export function MtlsSettingsScreen({}: ScreenProps) {
  const { colors } = useTheme()

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          For endpoints behind a reverse proxy that requires mutual TLS authentication
        </Text>

        <MtlsSection />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40
  },
  intro: {
    ...text.body,
    marginBottom: space.xl
  }
})
