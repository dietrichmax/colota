/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import i18next from "i18next"
import type { TranslationKey } from "./options"

/** For non-React callers. Side-effect free, unlike `index.ts`, so importing it runs no device detection. */
export function t(key: TranslationKey, options?: Record<string, unknown>): string {
  return i18next.t(key, options) as string
}
