/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import en from "./locales/en.json"

export const SUPPORTED_LANGUAGES = ["en"] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const FALLBACK_LANGUAGE: SupportedLanguage = "en"

/**
 * Side-effect free so `jest.setup.js` can share it: importing the entry point would run device
 * detection against an unmocked bridge.
 *
 * `keySeparator: false` because the catalogs are flat, or i18next reads a dotted key as a nested
 * path first. Resources are inline because `init()` is synchronous only when they are.
 */
export const I18N_OPTIONS = {
  fallbackLng: FALLBACK_LANGUAGE,
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
  returnNull: false,
  keySeparator: false as const
}
