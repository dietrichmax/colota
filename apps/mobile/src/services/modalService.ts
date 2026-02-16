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

export function showConfirm(options: {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  destructive?: boolean
}): Promise<boolean> {
  const { title, message, confirmText = "OK", cancelText = "Cancel", destructive = false } = options

  return new Promise((resolve) => {
    if (!_handler) {
      Alert.alert(
        title,
        message,
        [
          { text: cancelText, style: "cancel", onPress: () => resolve(false) },
          { text: confirmText, onPress: () => resolve(true) }
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
        { text: cancelText, style: "secondary" },
        { text: confirmText, style: destructive ? "destructive" : "primary" }
      ],
      resolve: (index) => resolve(index === 1)
    })
  })
}
