/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { View, Text, StyleSheet } from "react-native"
import { Info, CircleAlert, TriangleAlert, CircleCheckBig } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts, lineHeights, type } from "../../styles/typography"
import { radius } from "@colota/shared"
import { type ModalRequest, type AlertVariant, registerModalHandler } from "../../services/modalService"
import { size, space } from "../../constants"
import { Button } from "./Button"
import { DialogShell } from "./DialogShell"
import { TextField } from "./TextField"

const VARIANT_ICONS = {
  info: Info,
  error: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheckBig
} as const

const BUTTON_VARIANTS = {
  primary: "primary",
  secondary: "ghost",
  destructive: "danger"
} as const

export function AppModal() {
  const { colors } = useTheme()
  const [current, setCurrent] = useState<ModalRequest | null>(null)
  const [draft, setDraft] = useState("")
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
    setDraft(current?.input?.initialValue ?? "")
  }, [current])

  const handlePress = useCallback(
    (index: number) => {
      current?.resolve(index, draft)
      processNext()
    },
    [current, draft, processNext]
  )

  if (!current) return null

  const Icon = VARIANT_ICONS[current.variant]
  const iconColor = getVariantColor(current.variant, colors)
  const stacked = current.buttons.length > 2

  return (
    <DialogShell
      visible
      dismissible={false}
      onRequestClose={() => {}}
      footer={
        <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
          {current.buttons.map((btn, i) => (
            <Button key={i} title={btn.text} variant={BUTTON_VARIANTS[btn.style]} onPress={() => handlePress(i)} />
          ))}
        </View>
      }
    >
      <View style={[styles.iconContainer, { backgroundColor: iconColor + "15" }]}>
        <Icon size={size.icon.lg} color={iconColor} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
      {current.message ? <Text style={[styles.body, { color: colors.textSecondary }]}>{current.message}</Text> : null}

      {current.input && (
        <View style={styles.input}>
          <TextField
            accessibilityLabel={current.title}
            multiline={current.input.multiline}
            autoFocus
            value={draft}
            onChangeText={setDraft}
            placeholder={current.input.placeholder}
            testID="prompt-input"
          />
        </View>
      )}
    </DialogShell>
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

const styles = StyleSheet.create({
  iconContainer: {
    width: size.emptyIcon,
    height: size.emptyIcon,
    borderRadius: radius.pill,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: space.lg
  },
  title: {
    ...type.title,
    textAlign: "center",
    marginBottom: space.md
  },
  body: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    textAlign: "center"
  },
  input: {
    marginTop: space.lg
  },
  buttons: {
    flexDirection: "row",
    gap: space.sm
  },
  buttonsStacked: {
    flex: 1,
    flexDirection: "column",
    alignItems: "stretch"
  }
})
