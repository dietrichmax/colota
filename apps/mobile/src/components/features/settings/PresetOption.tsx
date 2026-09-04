/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { SelectablePreset, TRACKING_PRESETS } from "../../../types/global"
import { useTranslation } from "../../../i18n/useTranslation"
import { RadioRow } from "../../ui/RadioRow"

interface PresetOptionProps {
  preset: SelectablePreset
  isSelected: boolean
  isOfflineMode: boolean
  onSelect: (preset: SelectablePreset) => void
}

export function PresetOption({ preset, isSelected, isOfflineMode, onSelect }: PresetOptionProps) {
  const { t } = useTranslation()
  const config = TRACKING_PRESETS[preset]
  const description = isOfflineMode ? config.description.split(" • ")[0] : config.description

  // The two notes were tinted badges; a plain line keeps them readable and out of colour alone.
  const note =
    preset === "balanced"
      ? t("preset.recommended")
      : config.batteryImpact === "High"
        ? t("preset.highBattery")
        : undefined

  return (
    <RadioRow
      label={config.label}
      caption={description}
      description={note}
      selected={isSelected}
      onPress={() => onSelect(preset)}
    />
  )
}
