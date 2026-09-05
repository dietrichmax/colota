/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Alert } from "react-native"

export type AlertVariant = "info" | "error" | "warning" | "success"

export interface ModalRequest {
  title: string
  message: string
  variant: AlertVariant
  buttons: Array<{
    text: string
    style: "primary" | "secondary" | "destructive"
  }>
  /** The sheet has no scrim tap and back does not dismiss it; the user must answer. */
  blocking?: boolean
  resolve: (buttonIndex: number) => void
}

type ModalHandler = (request: ModalRequest) => void

let _handler: ModalHandler | null = null

export function registerModalHandler(handler: ModalHandler) {
  _handler = handler
}

export function showAlert(title: string, message: string, variant: AlertVariant = "info"): void {
  if (!_handler) {
    Alert.alert(title, message)
    return
  }

  _handler({
    title,
    message,
    variant,
    buttons: [{ text: "OK", style: "primary" }],
    resolve: () => {}
  })
}

export function showChoice(options: {
  title: string
  message: string
  variant?: AlertVariant
  blocking?: boolean
  buttons: Array<{
    text: string
    style?: "primary" | "secondary" | "destructive"
  }>
}): Promise<number> {
  const { title, message, variant = "warning", blocking = false, buttons } = options

  return new Promise((resolve) => {
    if (!_handler) {
      Alert.alert(
        title,
        message,
        buttons.map((btn, i) => ({
          text: btn.text,
          style: btn.style === "destructive" ? "destructive" : btn.style === "secondary" ? "cancel" : "default",
          onPress: () => resolve(i)
        })),
        { cancelable: false }
      )
      return
    }

    _handler({
      title,
      message,
      variant,
      blocking,
      buttons: buttons.map((btn) => ({
        text: btn.text,
        style: btn.style ?? "secondary"
      })),
      resolve: (index) => resolve(index)
    })
  })
}

export function showConfirm(options: {
  title: string
  message: string
  confirmText: string
  cancelText?: string
  destructive?: boolean
}): Promise<boolean> {
  const { title, message, confirmText, cancelText = "Cancel", destructive = false } = options

  return new Promise((resolve) => {
    if (!_handler) {
      Alert.alert(
        title,
        message,
        [
          { text: confirmText, onPress: () => resolve(true) },
          { text: cancelText, style: "cancel", onPress: () => resolve(false) }
        ],
        { cancelable: false }
      )
      return
    }

    _handler({
      title,
      message,
      variant: destructive ? "error" : "info",
      buttons: [
        { text: confirmText, style: destructive ? "destructive" : "primary" },
        { text: cancelText, style: "secondary" }
      ],
      resolve: (index) => resolve(index === 0)
    })
  })
}
