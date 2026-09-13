/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { StyleSheet, ScrollView } from "react-native"
import { ScreenProps } from "../types/global"
import { Container } from "../components"
import { MtlsSection } from "../components/features/settings/MtlsSection"
import { space } from "../constants"

export function MtlsSettingsScreen({}: ScreenProps) {
  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <MtlsSection />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  }
})
