/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { MapPin } from "lucide-react-native"
import { registerDisclosureCallback } from "../../services/LocationServicePermission"
import { DisclosureModal } from "./DisclosureModal"

/**
 * Prominent in-app disclosure modal for location data collection.
 * Required by Google Play's User Data policy.
 */
export function LocationDisclosureModal() {
  return (
    <DisclosureModal
      icon={MapPin}
      blocking
      title="Location Data Collection"
      paragraphs={[
        "Colota collects location data to enable GPS tracking and sending your position to your configured server, even when the app is closed or not in use.",
        "This data is sent only to the server you set up. No data is shared with third parties.",
        "While tracking runs, a persistent notification shows its status. Battery optimization should be disabled for reliable background operation."
      ]}
      confirmLabel="Agree"
      registerCallback={registerDisclosureCallback}
    />
  )
}
