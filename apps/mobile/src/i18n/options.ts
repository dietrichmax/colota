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

/** Each language in its own words, so a reader finds theirs whatever the app is set to. */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = { en: "English" }

/** The device tag carries a region, the catalogs do not. */
export function resolveLanguage(tag: string | undefined): SupportedLanguage {
  const base = (tag ?? "").split("-")[0].toLowerCase()
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base) ? (base as SupportedLanguage) : FALLBACK_LANGUAGE
}

/** Side-effect free so `jest.setup.js` can share it. Inline resources keep `init()` synchronous. */
export const I18N_OPTIONS = {
  fallbackLng: FALLBACK_LANGUAGE,
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  returnNull: false,
  // An emptied value in a translation shows the English, not a blank label.
  returnEmptyString: false,
  keySeparator: false as const
}
