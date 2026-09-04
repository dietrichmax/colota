/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useCallback, useSyncExternalStore } from "react"
import i18next from "i18next"

function subscribe(onChange: () => void): () => void {
  i18next.on("languageChanged", onChange)
  return () => i18next.off("languageChanged", onChange)
}

function getSnapshot(): string {
  return i18next.language
}

export function useTranslation(): { t: (key: string, options?: Record<string, unknown>) => string } {
  const language = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const t = useCallback(
    (key: string, options?: Record<string, unknown>) => i18next.getFixedT(language)(key, options) as string,
    [language]
  )
  return { t }
}
