/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 *
 * Re-exports typography from @colota/shared - the single source of truth.
 * Platform-specific font variants (Regular, Medium, etc.) are derived here.
 */

import { TextStyle } from "react-native"
import { fontFamily, type } from "@colota/shared"
import type { FontWeightName, TypeRoleName } from "@colota/shared"

export { fontSizes } from "@colota/shared"

const WEIGHT_SUFFIX: Record<FontWeightName, string> = {
  regular: "Regular",
  medium: "Medium",
  semiBold: "SemiBold",
  bold: "Bold"
}

export const fonts: Record<string, Pick<TextStyle, "fontFamily">> = {
  regular: { fontFamily: `${fontFamily}-Regular` },
  medium: { fontFamily: `${fontFamily}-Medium` },
  semiBold: { fontFamily: `${fontFamily}-SemiBold` },
  bold: { fontFamily: `${fontFamily}-Bold` }
}

function roleStyle(name: TypeRoleName): TextStyle {
  const role = type[name]
  return {
    fontFamily: name === "mono" ? "monospace" : `${fontFamily}-${WEIGHT_SUFFIX[role.weight]}`,
    fontSize: role.fontSize,
    lineHeight: role.lineHeight,
    letterSpacing: role.letterSpacing,
    fontVariant: [...role.fontVariant]
  }
}

export const text = (Object.keys(type) as TypeRoleName[]).reduce(
  (acc, name) => {
    acc[name] = roleStyle(name)
    return acc
  },
  {} as Record<TypeRoleName, TextStyle>
)
