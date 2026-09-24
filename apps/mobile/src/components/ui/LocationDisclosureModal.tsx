/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { MapPin } from "lucide-react-native"
import { size } from "../../constants"
import { useTheme } from "../../hooks/useTheme"
import { registerDisclosureCallback } from "../../services/LocationServicePermission"
import { DisclosureModal } from "./DisclosureModal"
import { useTranslation } from "../../i18n/useTranslation"

/**
 * Prominent in-app disclosure modal for location data collection.
 * Required by Google Play's User Data policy.
 */
export function LocationDisclosureModal() {
  const { colors } = useTheme()
  const { t } = useTranslation()

  return (
    <DisclosureModal
      icon={<MapPin size={size.icon.lg} color={colors.primary} />}
      title={t("disclosure.location.title")}
      paragraphs={[t("disclosure.location.p1"), t("disclosure.location.p2"), t("disclosure.location.p3")]}
      confirmLabel={t("disclosure.location.confirm")}
      registerCallback={registerDisclosureCallback}
    />
  )
}
