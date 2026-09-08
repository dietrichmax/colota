/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback } from "react"
import { DailyStat } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { DialogShell } from "../../ui/DialogShell"
import { Button } from "../../ui/Button"
import { CalendarPicker } from "./CalendarPicker"

interface DayPickerModalProps {
  visible: boolean
  date: Date
  onSelect: (date: Date) => void
  onRequestClose: () => void
  daysWithData: Set<string>
  dayStats: ReadonlyMap<string, DailyStat>
  onMonthChange: (year: number, month: number) => void
  onPrefetchMonth?: (year: number, month: number) => void
}

export function DayPickerModal({
  visible,
  date,
  onSelect,
  onRequestClose,
  daysWithData,
  dayStats,
  onMonthChange,
  onPrefetchMonth
}: DayPickerModalProps) {
  const { colors } = useTheme()

  const handleSelect = useCallback(
    (selected: Date) => {
      onSelect(selected)
      onRequestClose()
    },
    [onSelect, onRequestClose]
  )

  return (
    <DialogShell
      visible={visible}
      onRequestClose={onRequestClose}
      gutter="picker"
      footer={<Button variant="ghost" title="Close" onPress={onRequestClose} testID="day-picker-close-btn" />}
    >
      <CalendarPicker
        date={date}
        onSelectDay={handleSelect}
        colors={colors}
        daysWithData={daysWithData}
        dayStats={dayStats}
        onMonthChange={onMonthChange}
        onPrefetchMonth={onPrefetchMonth}
      />
    </DialogShell>
  )
}
