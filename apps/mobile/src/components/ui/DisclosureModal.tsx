/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Modal, View, Text, Pressable, StyleSheet, BackHandler } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { fonts } from "../../styles/typography"
import { fontSizes } from "@colota/shared"

interface DisclosureModalProps {
  icon: React.ReactNode
  title: string
  paragraphs: string[]
  confirmLabel: string
  registerCallback: (cb: () => Promise<boolean>) => void
}

/**
 * Reusable themed disclosure modal.
 *
 * Renders a centered card with an icon, title, body paragraphs,
 * and "Not Now" / confirm buttons. The caller registers a callback
 * that, when invoked, shows the modal and resolves with the user's choice.
 */
export function DisclosureModal({ icon, title, paragraphs, confirmLabel, registerCallback }: DisclosureModalProps) {
  const { colors } = useTheme()
  const [visible, setVisible] = useState(false)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  useEffect(() => {
    registerCallback(() => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve
        setVisible(true)
      })
    })
  }, [registerCallback])

  // Block hardware back button while visible
  useEffect(() => {
    if (!visible) return
    const handler = BackHandler.addEventListener("hardwareBackPress", () => true)
    return () => handler.remove()
  }, [visible])

  const handleConfirm = useCallback(() => {
    setVisible(false)
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const handleNotNow = useCallback(() => {
    setVisible(false)
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.cardElevated, borderRadius: colors.borderRadius + 4 }]}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: colors.primary + "15" }]}>{icon}</View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          {/* Body */}
          {paragraphs.map((text, i) => (
            <Text key={i} style={[styles.body, i > 0 && styles.bodySpaced, { color: colors.textSecondary }]}>
              {text}
            </Text>
          ))}

          {/* Buttons */}
          <View style={styles.buttons}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.secondaryButton,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 }
              ]}
              onPress={handleNotNow}
            >
              <Text style={[styles.buttonText, { color: colors.textSecondary }]}>Not Now</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.7 }
              ]}
              onPress={handleConfirm}
            >
              <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32
  },
  card: {
    width: "100%",
    padding: 24,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 16
  },
  title: {
    fontSize: fontSizes.cardTitle,
    ...fonts.bold,
    textAlign: "center",
    marginBottom: 16
  },
  body: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: 20
  },
  bodySpaced: {
    marginTop: 8
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center"
  },
  primaryButton: {},
  secondaryButton: {
    borderWidth: 1.5
  },
  buttonText: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  }
})
