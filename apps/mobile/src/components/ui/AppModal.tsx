/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { StyleSheet, Text } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { text as typeRoles } from "../../styles/typography"
import { type ModalRequest, registerModalHandler } from "../../services/modalService"
import { SEMANTIC_ICONS, semanticColor } from "./semantic"
import { Button } from "./Button"
import { ListItem } from "./ListItem"
import { Sheet } from "./Sheet"

type ModalButton = ModalRequest["buttons"][number]

const BUTTON_VARIANT = {
  primary: "primary",
  destructive: "danger",
  secondary: "ghost"
} as const

/** More than this many choices stop being a button stack and become a list. */
const MAX_STACKED_BUTTONS = 2

/**
 * Back, the scrim and the dismiss slot all resolve to the same button, so a sheet that
 * is closed without a choice reports what the caller reads as "the user backed out".
 * Callers pass their dismissive option as `secondary`; a single-button alert falls back
 * to that button, whose resolve is a no-op.
 */
function dismissiveIndex(buttons: ModalButton[]): number {
  const last = buttons.map((btn) => btn.style).lastIndexOf("secondary")
  return last === -1 ? buttons.length - 1 : last
}

/** Confirming action first, dismissive last, without disturbing the caller's indices. */
function displayOrder(buttons: ModalButton[]): number[] {
  const indices = buttons.map((_, index) => index)
  return [
    ...indices.filter((i) => buttons[i].style !== "secondary"),
    ...indices.filter((i) => buttons[i].style === "secondary")
  ]
}

export function AppModal() {
  const { colors } = useTheme()
  const [current, setCurrent] = useState<ModalRequest | null>(null)
  const queueRef = useRef<ModalRequest[]>([])
  // The sheet plays its exit animation after `current` clears, so it keeps rendering
  // the request it is closing rather than an empty surface.
  const shownRef = useRef<ModalRequest | null>(null)

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

  const handlePress = useCallback(
    (index: number) => {
      current?.resolve(index)
      processNext()
    },
    [current, processNext]
  )

  if (current) shownRef.current = current
  const request = shownRef.current
  if (!request) return null

  const dismissIndex = dismissiveIndex(request.buttons)
  const dismiss = () => handlePress(dismissIndex)
  const asList = request.buttons.length > MAX_STACKED_BUTTONS
  const listIndices = asList ? request.buttons.map((_, index) => index).filter((index) => index !== dismissIndex) : []

  const actions = asList ? (
    <Button
      title={request.buttons[dismissIndex].text}
      variant="ghost"
      onPress={() => handlePress(dismissIndex)}
      testID={`modal-btn-${dismissIndex}`}
    />
  ) : (
    displayOrder(request.buttons).map((index) => (
      <Button
        key={index}
        title={request.buttons[index].text}
        variant={BUTTON_VARIANT[request.buttons[index].style]}
        onPress={() => handlePress(index)}
        testID={`modal-btn-${index}`}
      />
    ))
  )

  return (
    <Sheet
      visible={current !== null}
      title={request.title}
      icon={SEMANTIC_ICONS[request.variant]}
      iconColor={semanticColor(request.variant, colors)}
      onDismiss={request.blocking ? undefined : dismiss}
      actions={actions}
      testID="app-modal-sheet"
    >
      <Text style={[styles.message, { color: colors.textSecondary }]}>{request.message}</Text>
      {listIndices.map((index, position) => (
        <ListItem
          key={index}
          label={request.buttons[index].text}
          onPress={() => handlePress(index)}
          divider={position < listIndices.length - 1}
          trailingIcon={null}
          accessibilityHint=""
          testID={`modal-btn-${index}`}
        />
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  message: {
    ...typeRoles.body
  }
})
