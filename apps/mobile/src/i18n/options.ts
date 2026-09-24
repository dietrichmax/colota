/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import en from "./locales/en.json"

export const SUPPORTED_LANGUAGES = ["en"] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

type CatalogKey = keyof typeof en
type PluralBase<K> = K extends `${infer Base}_${"zero" | "one" | "two" | "few" | "many" | "other"}` ? Base : never

/** A key missing from the English catalog fails tsc. A plural is called by its base with `count`. */
export type TranslationKey = CatalogKey | PluralBase<CatalogKey>

export const FALLBACK_LANGUAGE: SupportedLanguage = "en"

/** Side-effect free so `jest.setup.js` can share it. Inline resources keep `init()` synchronous. */
export const I18N_OPTIONS = {
  fallbackLng: FALLBACK_LANGUAGE,
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  returnNull: false,
  keySeparator: false as const
}
