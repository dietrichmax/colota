/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { space } from "../../constants"

export function Footer() {
  const { colors } = useTheme()

  return (
    <View style={styles.footer}>
      <Text style={[styles.copyright, { color: colors.textLight }]}>© 2026 Max Dietrich</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  footer: {
    marginTop: space.xxl,
    marginBottom: space.lg,
    alignItems: "center"
  },
  copyright: {
    fontSize: fontSizes.caption,
    ...fonts.regular
  }
})
