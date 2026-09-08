/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { type } from "../../styles/typography"
import { elevation, space } from "../../constants"

interface DialogShellProps {
  visible: boolean
  onRequestClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  gutter?: "default" | "picker"
  /** False for a dialog the caller must answer: no scrim tap, hardware back does nothing. */
  dismissible?: boolean
}

export function DialogShell({
  visible,
  onRequestClose,
  title,
  children,
  footer,
  gutter = "default",
  dismissible = true
}: DialogShellProps) {
  const { colors } = useTheme()
  const picker = gutter === "picker"
  const dismiss = dismissible ? onRequestClose : () => {}

  return (
    <Modal transparent statusBarTranslucent visible={visible} animationType="fade" onRequestClose={dismiss}>
      <Pressable
        accessibilityRole="none"
        testID="dialog-scrim"
        style={[styles.scrim, picker ? styles.scrimPicker : styles.scrimDefault, { backgroundColor: colors.overlay }]}
        onPress={dismiss}
      >
        <Pressable
          accessibilityRole="none"
          testID="dialog-card"
          onPress={() => {}}
          style={[styles.card, picker ? styles.cardPicker : styles.cardDefault, { backgroundColor: colors.surfaceRaised }]}
        >
          {title ? (
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
          ) : null}
          {children}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  scrimDefault: {
    paddingHorizontal: space.xxl
  },
  scrimPicker: {
    paddingHorizontal: space.lg
  },
  card: {
    width: "100%",
    borderRadius: radius.lg,
    elevation: elevation.overlay
  },
  cardDefault: {
    padding: space.xl
  },
  cardPicker: {
    padding: space.md
  },
  title: {
    ...type.title,
    marginBottom: space.md
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.sm,
    marginTop: space.lg
  }
})
