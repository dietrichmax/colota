/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useCallback, useEffect, useState } from "react"
import { AppState } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { getLanguageChoice, type LanguageChoice } from "../i18n/language"

/** Re-read on every return to the app, because Android's own App languages page can change it. */
export function useLanguageChoice(): [LanguageChoice | null, (choice: LanguageChoice) => void] {
  const [choice, setChoice] = useState<LanguageChoice | null>(null)

  useFocusEffect(
    useCallback(() => {
      getLanguageChoice().then(setChoice)
    }, [])
  )

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") getLanguageChoice().then(setChoice)
    })
    return () => sub.remove()
  }, [])

  return [choice, setChoice]
}
