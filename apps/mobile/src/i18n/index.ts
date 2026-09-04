/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import i18next from "i18next"
import NativeLocationService from "../services/NativeLocationService"
import { logger } from "../utils/logger"
import { I18N_OPTIONS, FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from "./options"

export { SUPPORTED_LANGUAGES }

/** Matches "de-DE" and "de" alike, since the device tag carries a region and the catalogs do not. */
function resolveLanguage(tag: string | undefined): SupportedLanguage {
  const base = (tag ?? "").split("-")[0].toLowerCase()
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base) ? (base as SupportedLanguage) : FALLBACK_LANGUAGE
}

/** Languages whose plurals need more than one/other, so they cannot ride the English fallback. */
const COMPLEX_PLURAL_LANGUAGES: readonly string[] = ["pl", "ru", "cs", "ar", "uk", "hr", "lt", "sk"]

/**
 * Hermes implements most of Intl but not PluralRules, and i18next then applies English one/other
 * rules without saying so. Correct while only en ships, wrong for Polish or Russian, so warn now
 * and fail only once a supported language depends on it: throwing outright would kill every Hermes
 * build at bundle evaluation, which no test can catch because Node has PluralRules.
 */
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

// Runs on first import, not from a call in App.tsx: ES imports hoist, so a call there would execute
// only after every screen module had evaluated. No screen resolves a key at module scope yet, so this
// starts mattering the day the screen-config and preset constants become keys.
initI18n()

/** The non-React entry point. Nothing calls it yet; modalService and setupConfig are the ones that will. */
export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options) as string
}
