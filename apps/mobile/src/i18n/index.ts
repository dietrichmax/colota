/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import i18next from "i18next"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { I18N_OPTIONS, SUPPORTED_LANGUAGES, resolveLanguage, type SupportedLanguage } from "./options"

export { SUPPORTED_LANGUAGES }
export { t } from "./t"

/** Plurals beyond one/other, which the English fallback gets wrong. */
const COMPLEX_PLURAL_LANGUAGES: readonly string[] = ["pl", "ru", "cs", "ar", "uk", "hr", "lt", "sk"]

// Hermes has no PluralRules; an unconditional throw would kill every build at bundle evaluation.
function checkPluralRules(): void {
  if (typeof Intl !== "undefined" && typeof Intl.PluralRules !== "undefined") return

  const affected = SUPPORTED_LANGUAGES.filter((l) => COMPLEX_PLURAL_LANGUAGES.includes(l))
  if (affected.length > 0) {
    throw new Error(
      `Intl.PluralRules is missing but ${affected.join(", ")} need it. i18next would silently use ` +
        "English plural rules. Add @formatjs/intl-pluralrules."
    )
  }
  logger.warn("[i18n] Intl.PluralRules is unavailable; add @formatjs/intl-pluralrules before a language needs it")
}

export function initI18n(): SupportedLanguage {
  const deviceTag = NativeLocationService.getBuildConfig()?.APP_LANGUAGE
  const language = resolveLanguage(deviceTag)

  i18next.init({ ...I18N_OPTIONS, lng: language })

  checkPluralRules()
  logger.debug(`[i18n] Initialised as '${language}' (device reported '${deviceTag ?? "unknown"}')`)
  return language
}

// On import, because a call in App.tsx would run after every screen module has evaluated.
initI18n()
