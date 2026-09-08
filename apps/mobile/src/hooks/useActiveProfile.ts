/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useEffect, useState } from "react"
import NativeLocationService from "../services/NativeLocationService"
import type { SavedTrackingProfile } from "../types/global"
import { logger } from "../utils/logger"

/** The profile behind `activeProfileId`, or null while none is active or the id matches no saved profile. */
export function useActiveProfile(activeProfileId: number | null): SavedTrackingProfile | null {
  const [profile, setProfile] = useState<SavedTrackingProfile | null>(null)

  useEffect(() => {
    if (activeProfileId === null) {
      setProfile(null)
      return
    }
    let cancelled = false
    NativeLocationService.getProfiles()
      .then((profiles) => {
        if (!cancelled) setProfile(profiles.find((p) => p.id === activeProfileId) ?? null)
      })
      .catch((err) => logger.error("[useActiveProfile] Failed to resolve the active profile:", err))
    return () => {
      cancelled = true
    }
  }, [activeProfileId])

  return profile
}
