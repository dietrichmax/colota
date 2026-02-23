/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Wifi } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { registerLocalNetworkDisclosureCallback } from "../../services/LocationServicePermission"
import { DisclosureModal } from "./DisclosureModal"

/**
 * Disclosure modal for the local network (Nearby Devices) permission.
 * Shown before requesting NEARBY_WIFI_DEVICES on Android 17+.
 */
export function LocalNetworkDisclosureModal() {
  const { colors } = useTheme()

  return (
    <DisclosureModal
      icon={<Wifi size={28} color={colors.primary} />}
      title="Local Network Access"
      paragraphs={[
        "Your server is on the local network. Colota needs the nearby devices permission to reach it.",
        "This permission is only used to connect to your self-hosted server. No device scanning or discovery is performed."
      ]}
      confirmLabel="Continue"
      registerCallback={registerLocalNetworkDisclosureCallback}
    />
  )
}
