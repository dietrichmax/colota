/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { MapPin } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { registerDisclosureCallback } from "../../services/LocationServicePermission"
import { DisclosureModal } from "./DisclosureModal"

/**
 * Prominent in-app disclosure modal for location data collection.
 * Required by Google Play's User Data policy.
 */
export function LocationDisclosureModal() {
  const { colors } = useTheme()

  return (
    <DisclosureModal
      icon={<MapPin size={28} color={colors.primary} />}
      title="Location Data Collection"
      paragraphs={[
        "Colota collects location data to enable GPS tracking and sending your position to your configured server, even when the app is closed or not in use.",
        "This data is sent only to the server you set up. No data is shared with third parties.",
        "The app also needs notification and battery permissions to keep tracking running reliably."
      ]}
      confirmLabel="Agree"
      registerCallback={registerDisclosureCallback}
    />
  )
}
