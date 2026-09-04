/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet } from "react-native"
import type { LucideIcon } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { RadioRow } from "./RadioRow"

export const FormatOption = ({
  icon: Icon,
  title,
  subtitle,
  description,
  extension,
  selected,
  onPress
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  description: string
  extension: string
  selected: boolean
  onPress: () => void
}) => {
  const { colors } = useTheme()

  return (
    <RadioRow
      icon={Icon}
      label={title}
      caption={subtitle}
      description={description}
      selected={selected}
      onPress={onPress}
      accessibilityLabel={[title, extension, subtitle, description].join(", ")}
      accessory={<Text style={[styles.extension, { color: colors.textLight }]}>{extension}</Text>}
    />
  )
}

const styles = StyleSheet.create({
  extension: {
    ...text.mono
  }
})
