/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Wifi } from "lucide-react-native"
import { size } from "../../constants"
import { useTheme } from "../../hooks/useTheme"
import { registerLocalNetworkDisclosureCallback } from "../../services/LocationServicePermission"
import { DisclosureModal } from "./DisclosureModal"
import { useTranslation } from "../../i18n/useTranslation"

/**
 * Disclosure modal for the local network permission.
 * Shown before requesting ACCESS_LOCAL_NETWORK on Android 16+.
 */
export function LocalNetworkDisclosureModal() {
  const { colors } = useTheme()
  const { t } = useTranslation()

  return (
    <DisclosureModal
      icon={<Wifi size={size.icon.lg} color={colors.primary} />}
      title={t("disclosure.network.title")}
      paragraphs={[t("disclosure.network.p1"), t("disclosure.network.p2")]}
      confirmLabel={t("disclosure.network.confirm")}
      registerCallback={registerLocalNetworkDisclosureCallback}
    />
  )
}
