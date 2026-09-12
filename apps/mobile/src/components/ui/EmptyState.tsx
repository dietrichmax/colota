/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import { type LucideIcon } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts, lineHeights } from "../../styles/typography"
import { size, space } from "../../constants"
import { Button } from "./Button"

type EmptyStateProps = {
  title: string
  /** Why it is empty, or what fills it. Omit when the title already says both. */
  hint?: string
  /** Only when the empty state owns the screen: the glyph also centres the block. */
  icon?: LucideIcon
  /** For a container that already insets its rows, which would otherwise double the padding. */
  style?: StyleProp<ViewStyle>
  action?: { label: string; onPress: () => void }
}

// Two shapes, and the icon picks between them. An empty tab or screen gets the glyph and
// centres, so it reads as new rather than broken. An empty section inside a populated screen
// stays one left-aligned line, where a glyph would be louder than the content around it.
export function EmptyState({ title, hint, icon: Icon, style, action }: EmptyStateProps) {
  const { colors } = useTheme()
  const centred = Boolean(Icon)

  return (
    <View style={[styles.container, centred && styles.centred, style]}>
      {Icon ? (
        <View style={[styles.iconCircle, { backgroundColor: colors.well }]}>
          <Icon size={size.icon.lg} color={colors.textSecondary} />
        </View>
      ) : null}
      <Text style={[styles.title, centred && styles.centredText, { color: colors.text }]}>{title}</Text>
      {hint ? (
        <Text style={[styles.hint, centred && styles.centredText, { color: colors.textSecondary }]}>{hint}</Text>
      ) : null}
      {action ? <Button variant="ghost" title={action.label} onPress={action.onPress} style={styles.action} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // Most of these sit in a bare FlatList, so the state pays its own inset rather than relying
  // on a container that may or may not have one.
  container: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg
  },
  // A screen that is entirely empty can afford the room; an empty section under other content
  // cannot, because the block above it has already paid its own bottom margin.
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xxl
  },
  centredText: {
    textAlign: "center"
  },
  iconCircle: {
    width: size.emptyIcon,
    height: size.emptyIcon,
    borderRadius: size.emptyIcon / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg
  },
  title: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  hint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    lineHeight: lineHeights.description,
    marginTop: space.xs
  },
  action: {
    alignSelf: "center"
  }
})
