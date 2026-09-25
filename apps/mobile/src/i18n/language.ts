/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import i18next from "i18next"
import NativeLocationService from "../services/NativeLocationService"
import { resolveLanguage, type SupportedLanguage } from "./options"

export type LanguageChoice = SupportedLanguage | "system"

/** A failed read shows System default, which is what the app falls back to anyway. */
export async function getLanguageChoice(): Promise<LanguageChoice> {
  const language = await NativeLocationService.getAppLanguage()
  return language?.picked ? resolveLanguage(language.picked) : "system"
}

/** Follows a language change made outside the picker; a failed read keeps the language in use. */
export async function syncLanguage(): Promise<void> {
  const current = await NativeLocationService.getAppLanguage()
  if (!current) return
  const language = resolveLanguage(current.effective)
  if (language !== i18next.language) await i18next.changeLanguage(language)
}

/** Native keeps the choice, and i18next switches now so the screens follow without a restart. */
export async function setLanguageChoice(choice: LanguageChoice): Promise<void> {
  const effective = await NativeLocationService.setAppLanguage(choice === "system" ? "" : choice)
  await i18next.changeLanguage(resolveLanguage(effective))
}
