/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { Divider } from "./Divider"
import { Button } from "./Button"
import { semanticColor, SEMANTIC_ICONS, type SemanticVariant } from "./semantic"

const RULE_WIDTH = 3

type NoticeBase = {
  variant: SemanticVariant
  title: string
  message?: string
  testID?: string
}

type StaticNotice = NoticeBase & {
  onPress?: undefined
  actionLabel?: string
  onActionPress?: () => void
}

type RowActionNotice = NoticeBase & {
  onPress: () => void
  actionLabel?: undefined
  onActionPress?: undefined
}

type NoticeProps = StaticNotice | RowActionNotice

/**
 * The banner shape for this rework: a row between two hairlines, the hue carried by a
 * rule and the icon while the text stays ink. A filled colour box is the template idiom
 * the rework removes, so there is no fill and no radius.
 *
 * Either the whole row is the action or the row is static with one ghost action; the
 * prop union rules out a row that is both tappable and holds a button.
 */
export function Notice(props: NoticeProps) {
  const { variant, title, message, testID } = props
  const { colors } = useTheme()
  const hue = semanticColor(variant, colors)
  const Icon = SEMANTIC_ICONS[variant]
  const composedLabel = [title, message].filter(Boolean).join(", ")

  const body = (
    <View style={styles.row}>
      <View testID="notice-rule" style={[styles.rule, { backgroundColor: hue }]} importantForAccessibility="no" />
      <View style={styles.icon} importantForAccessibility="no">
        <Icon size={size.icon.md} color={hue} />
      </View>
      <View style={styles.content} accessible accessibilityLabel={composedLabel}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
      </View>
      {props.onPress ? (
        <View importantForAccessibility="no">
          <ChevronRight size={size.icon.md} color={colors.textLight} />
        </View>
      ) : null}
    </View>
  )

  return (
    <View testID={testID}>
      <Divider tight />
      {props.onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={composedLabel}
          android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
          onPress={props.onPress}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {props.onPress === undefined && props.actionLabel && props.onActionPress ? (
        <View style={styles.action}>
          <Button title={props.actionLabel} variant="ghost" align="start" onPress={props.onActionPress} />
        </View>
      ) : null}
      <Divider tight />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.row,
    paddingVertical: space.md,
    paddingEnd: space.lg
  },
  rule: {
    width: RULE_WIDTH,
    alignSelf: "stretch"
  },
  icon: {
    width: size.iconColumn,
    alignItems: "center"
  },
  content: {
    flex: 1
  },
  title: {
    ...text.bodyStrong
  },
  message: {
    ...text.label
  },
  action: {
    paddingStart: size.iconColumn + RULE_WIDTH,
    paddingBottom: space.sm
  }
})
