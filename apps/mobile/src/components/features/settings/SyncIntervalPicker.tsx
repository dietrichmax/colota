/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useRef, useState } from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { useTimeout } from "../../../hooks/useTimeout"
import { fontSizes, fonts, lineHeights } from "../../../styles/typography"
import {
  SAVE_SUCCESS_DISPLAY_MS,
  SYNC_INTERVAL_LABELS,
  SYNC_INTERVAL_PRESETS,
  SYNC_INTERVAL_SUBS,
  size,
  space
} from "../../../constants"
import { NumericInput } from "../../ui/NumericInput"
import { RadioRow } from "../../ui/RadioRow"
import { formatDuration } from "../../../utils/dashboardState"
import { parseWholeNumber, wholeNumberError } from "../../../utils/settingsValidation"

type SyncIntervalPickerProps = {
  /** A heading above the group; the settings screen titles the card instead and passes neither. */
  label?: string
  hint?: string
  value: number
  /** The floor a blurred value is clamped to. Settings takes 1, a profile takes 0. */
  min?: number
  /** Pull the first row up under a SectionTitle or the heading; off when a row precedes the group. */
  pullUp?: boolean
  /** A preset row was chosen. */
  onSelect: (seconds: number) => void
  /** A valid number was typed into the custom field. */
  onChange: (seconds: number) => void
  /** An invalid number was corrected on blur. */
  onClamp: (seconds: number) => void
  testIDPrefix?: string
}

/**
 * The presets, Custom, and the field Custom reveals. Two screens draw this, and when it was
 * copy-pasted both carried the same defect: Custom seeded a hardcoded 1800 and saved it, throwing
 * away the interval you had.
 *
 * Custom mode cannot be derived from the value, because every number a user might start from is
 * also a preset. It is state here, and opening Custom saves nothing at all - it only seeds the
 * field from the current value and waits for a real one.
 */
export function SyncIntervalPicker({
  label,
  hint,
  value,
  min = 1,
  pullUp = true,
  onSelect,
  onChange,
  onClamp,
  testIDPrefix = "sync-interval"
}: SyncIntervalPickerProps) {
  const { colors } = useTheme()
  const [customOpen, setCustomOpen] = useState(false)
  const [input, setInput] = useState(value.toString())
  const [clampMessage, setClampMessage] = useState<string | undefined>()
  const clampTimer = useTimeout()
  const isCustom = customOpen || !SYNC_INTERVAL_PRESETS.includes(value)

  const emitted = useRef(value)
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value
      setInput(value.toString())
    }
  }, [value])

  const report = (seconds: number, notify: (seconds: number) => void) => {
    emitted.current = seconds
    notify(seconds)
  }

  const fieldHint = `${min > 0 ? `At least ${min} s. ` : ""}Longer means fewer requests and a later server.`

  return (
    <View>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      {hint ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : null}

      <View accessibilityRole="radiogroup" style={pullUp && styles.group}>
        {SYNC_INTERVAL_PRESETS.map((seconds) => (
          <RadioRow
            key={seconds}
            testID={`${testIDPrefix}-${seconds}`}
            label={SYNC_INTERVAL_LABELS[seconds]}
            sub={SYNC_INTERVAL_SUBS[seconds]}
            selected={!isCustom && value === seconds}
            onPress={() => {
              setCustomOpen(false)
              report(seconds, onSelect)
            }}
          />
        ))}
        <RadioRow
          testID={`${testIDPrefix}-custom`}
          label="Custom"
          sub={
            isCustom
              ? value === 0
                ? "Syncs each fix"
                : `Syncs every ${formatDuration(value)}`
              : "Set your own interval"
          }
          selected={isCustom}
          onPress={() => {
            setInput(value.toString())
            setCustomOpen(true)
          }}
        />

        {isCustom && (
          <View style={styles.customField}>
            <NumericInput
              label="Sync interval"
              value={input}
              onChange={(next) => {
                setInput(next)
                setClampMessage(undefined)
                const parsed = parseWholeNumber(next)
                if (parsed !== null && parsed >= min) report(parsed, onChange)
              }}
              onBlur={() => {
                const parsed = parseWholeNumber(input)
                if (parsed !== null && parsed >= min) return
                setInput(min.toString())
                setClampMessage(`Set to ${min} s`)
                clampTimer.set(() => setClampMessage(undefined), SAVE_SUCCESS_DISPLAY_MS)
                report(min, onClamp)
              }}
              unit="s"
              placeholder="300"
              hint={fieldHint}
              error={wholeNumberError(input, min, "s")}
              message={clampMessage}
            />
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: space.xs
  },
  hint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    lineHeight: lineHeights.description
  },
  group: {
    marginTop: -space.sm
  },
  customField: {
    paddingLeft: size.iconColumn,
    marginTop: -space.xs
  }
})
