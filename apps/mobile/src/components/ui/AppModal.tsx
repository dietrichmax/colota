/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Modal, View, Text, Pressable, StyleSheet, BackHandler } from "react-native"
import { Info, AlertCircle, AlertTriangle, CheckCircle } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fonts } from "../../styles/typography"
import { fontSizes } from "@colota/shared"
import { type ModalRequest, type AlertVariant, registerModalHandler } from "../../services/modalService"

const VARIANT_ICONS = {
  info: Info,
  error: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle
} as const

export function AppModal() {
  const { colors } = useTheme()
  const [current, setCurrent] = useState<ModalRequest | null>(null)
  const queueRef = useRef<ModalRequest[]>([])

  const processNext = useCallback(() => {
    if (queueRef.current.length > 0) {
      setCurrent(queueRef.current.shift()!)
    } else {
      setCurrent(null)
    }
  }, [])

  useEffect(() => {
    registerModalHandler((request) => {
      if (current) {
        queueRef.current.push(request)
      } else {
        setCurrent(request)
      }
    })
  }, [current])

  useEffect(() => {
    if (!current) return
    const handler = BackHandler.addEventListener("hardwareBackPress", () => true)
    return () => handler.remove()
  }, [current])

  const handlePress = useCallback(
    (index: number) => {
      current?.resolve(index)
      processNext()
    },
    [current, processNext]
  )

  if (!current) return null

  const Icon = VARIANT_ICONS[current.variant]
  const iconColor = getVariantColor(current.variant, colors)

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.cardElevated, borderRadius: colors.borderRadius + 4 }]}>
          <View style={[styles.iconContainer, { backgroundColor: iconColor + "15" }]}>
            <Icon size={28} color={iconColor} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{current.message}</Text>

          <View style={styles.buttons}>
            {current.buttons.map((btn, i) => {
              const btnStyles = getButtonStyles(btn.style, colors)
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [styles.button, btnStyles.container, pressed && { opacity: 0.7 }]}
                  onPress={() => handlePress(i)}
                >
                  <Text style={[styles.buttonText, btnStyles.text]}>{btn.text}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>
    </Modal>
  )
}

function getVariantColor(variant: AlertVariant, colors: ReturnType<typeof useTheme>["colors"]): string {
  switch (variant) {
    case "error":
      return colors.error
    case "warning":
      return colors.warning
    case "success":
      return colors.success
    default:
      return colors.info
  }
}

function getButtonStyles(
  style: "primary" | "secondary" | "destructive",
  colors: ReturnType<typeof useTheme>["colors"]
) {
  switch (style) {
    case "destructive":
      return {
        container: { backgroundColor: colors.error } as const,
        text: { color: colors.textOnPrimary } as const
      }
    case "secondary":
      return {
        container: { borderWidth: 1.5, borderColor: colors.border } as const,
        text: { color: colors.textSecondary } as const
      }
    default:
      return {
        container: { backgroundColor: colors.primary } as const,
        text: { color: colors.textOnPrimary } as const
      }
  }
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
    marginBottom: 12
  },
  body: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: 20,
    textAlign: "center"
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
  buttonText: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  }
})
