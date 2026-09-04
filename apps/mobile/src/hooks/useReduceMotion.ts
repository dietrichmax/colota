/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useEffect, useState } from "react"
import { AccessibilityInfo } from "react-native"

/**
 * True while the system "remove animations" setting is on. Every animated primitive
 * runs its motion token at duration 0 instead of skipping the animation, so the end
 * state is reached through the same code path.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let mounted = true

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled)
    })

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion)

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return reduceMotion
}
