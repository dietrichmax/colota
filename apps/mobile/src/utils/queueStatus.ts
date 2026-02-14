/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { ThemeColors } from "../types/global"
import { HIGH_QUEUE_THRESHOLD, CRITICAL_QUEUE_THRESHOLD } from "../constants"

/**
 * Returns the appropriate color for the queue count based on severity
 */
export const getQueueColor = (count: number, colors: ThemeColors) => {
  if (count > CRITICAL_QUEUE_THRESHOLD) return colors.error
  if (count > HIGH_QUEUE_THRESHOLD) return colors.warning
  return colors.text
}
