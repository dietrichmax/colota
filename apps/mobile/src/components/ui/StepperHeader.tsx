/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, Pressable, StyleSheet } from "react-native"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts, lineHeights } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"

type StepperHeaderProps = {
  title: string
  caption: string
  /** A mark before the title, such as a trip's swatch. */
  leading?: React.ReactNode
  onPrevious: () => void
  onNext: () => void
  previousLabel: string
  nextLabel: string
  previousDisabled?: boolean
  nextDisabled?: boolean
  /** Makes the title a button, with a chevron saying it opens something. */
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  testID: string
}

/**
 * The History family's spine: what you are looking at between two chevrons that step it, with one
 * caption saying what it holds. A day, a trip or a period.
 */
export function StepperHeader({
  title,
  caption,
  leading,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  previousDisabled = false,
  nextDisabled = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID
}: StepperHeaderProps) {
  const { colors } = useTheme()
  const ripple = { color: colors.text + STATE_LAYER_ALPHA }
  const chevronRipple = { ...ripple, borderless: true, radius: size.touch / 2 }

  const centre = (
    <>
      <View style={styles.titleRow}>
        {leading}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {onPress && <ChevronDown size={size.icon.sm} color={colors.textSecondary} />}
      </View>
      <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={2}>
        {caption}
      </Text>
    </>
  )

  return (
    <View style={[styles.row, { backgroundColor: colors.background }]} testID={`${testID}-header`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={previousLabel}
        accessibilityState={{ disabled: previousDisabled }}
        disabled={previousDisabled}
        onPress={onPrevious}
        android_ripple={previousDisabled ? undefined : chevronRipple}
        style={styles.chevron}
        testID={`${testID}-previous`}
      >
        <ChevronLeft size={size.icon.md} color={previousDisabled ? colors.textDisabled : colors.text} />
      </Pressable>

      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? `${title}, ${caption}`}
          accessibilityHint={accessibilityHint}
          onPress={onPress}
          android_ripple={ripple}
          style={styles.centre}
          testID={`${testID}-title`}
        >
          {centre}
        </Pressable>
      ) : (
        <View
          accessibilityRole="header"
          accessibilityLabel={accessibilityLabel ?? `${title}, ${caption}`}
          style={styles.centre}
          testID={`${testID}-title`}
        >
          {centre}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: nextDisabled }}
        disabled={nextDisabled}
        onPress={onNext}
        android_ripple={nextDisabled ? undefined : chevronRipple}
        style={styles.chevron}
        testID={`${testID}-next`}
      >
        <ChevronRight size={size.icon.md} color={nextDisabled ? colors.textDisabled : colors.text} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.row,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs
  },
  chevron: {
    width: size.touch,
    minHeight: size.touch,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center"
  },
  centre: {
    flex: 1,
    minHeight: size.touch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs
  },
  title: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    ...fonts.regular,
    fontVariant: ["tabular-nums"],
    marginTop: space.xxs
  }
})
