/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Info, AlertCircle, AlertTriangle, CheckCircle } from "lucide-react-native"
import type { ThemeColors } from "../../types/global"

export type SemanticVariant = "info" | "success" | "warning" | "error"

export const SEMANTIC_ICONS = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle
} as const

export function semanticColor(variant: SemanticVariant, colors: ThemeColors): string {
  switch (variant) {
    case "error":
      return colors.error
    case "warning":
      return colors.warning
    case "success":
      return colors.success
    default:
      return colors.info
  }
}
