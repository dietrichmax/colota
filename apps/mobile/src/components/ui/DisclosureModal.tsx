/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useRef, useEffect, useCallback } from "react"
import { Text, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { space } from "../../constants"
import { Button } from "./Button"
import { Sheet } from "./Sheet"

type IconComponent = React.ComponentType<{ size?: number; color?: string }>

interface DisclosureModalProps {
  icon: IconComponent
  title: string
  paragraphs: string[]
  confirmLabel: string
  registerCallback: (cb: () => Promise<boolean>) => void
  /** Play's prominent disclosure has to be answered, so back and the scrim do nothing. */
  blocking?: boolean
}

/**
 * The disclosure sheet: an icon, a title, body paragraphs and a confirm / Not Now pair.
 * The caller registers a callback that shows it and resolves with the user's choice.
 */
export function DisclosureModal({
  icon,
  title,
  paragraphs,
  confirmLabel,
  registerCallback,
  blocking = false
}: DisclosureModalProps) {
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

  const answer = useCallback((agreed: boolean) => {
    setVisible(false)
    resolveRef.current?.(agreed)
    resolveRef.current = null
  }, [])

  const handleConfirm = useCallback(() => answer(true), [answer])
  const handleNotNow = useCallback(() => answer(false), [answer])

  return (
    <Sheet
      visible={visible}
      title={title}
      icon={icon}
      iconColor={colors.primary}
      onDismiss={blocking ? undefined : handleNotNow}
      testID="disclosure-sheet"
      actions={
        <>
          <Button title={confirmLabel} onPress={handleConfirm} />
          <Button title="Not Now" variant="ghost" onPress={handleNotNow} />
        </>
      }
    >
      {paragraphs.map((paragraph, i) => (
        <Text key={i} style={[styles.body, i > 0 && styles.bodySpaced, { color: colors.textSecondary }]}>
          {paragraph}
        </Text>
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: {
    ...text.body
  },
  bodySpaced: {
    marginTop: space.sm
  }
})
