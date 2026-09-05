/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 *
 * Single source of truth for Colota typography.
 * Used by: apps/mobile, apps/docs
 */

export const fontFamily = "Inter"

// Subset of React Native's own fontVariant union. A plain string[] or a readonly
// tuple is rejected by TextStyle, so the roles below must be typed through this.
export type FontVariantName = "tabular-nums" | "stylistic-two"

export type FontWeightName = "regular" | "medium" | "semiBold" | "bold"

export interface TypeRole {
  fontSize: number
  lineHeight: number
  weight: FontWeightName
  letterSpacing: number
  fontVariant: FontVariantName[]
}

export type TypeRoleName =
  "display" | "title" | "heading" | "bodyStrong" | "body" | "label" | "caption" | "figureInline" | "coord" | "mono"

export const type: Record<TypeRoleName, TypeRole> = {
  display: { fontSize: 32, lineHeight: 40, weight: "medium", letterSpacing: 0, fontVariant: ["tabular-nums"] },
  title: { fontSize: 20, lineHeight: 26, weight: "semiBold", letterSpacing: 0, fontVariant: [] },
  heading: { fontSize: 17, lineHeight: 24, weight: "semiBold", letterSpacing: 0, fontVariant: [] },
  bodyStrong: { fontSize: 15, lineHeight: 22, weight: "medium", letterSpacing: 0, fontVariant: [] },
  body: { fontSize: 15, lineHeight: 22, weight: "regular", letterSpacing: 0, fontVariant: [] },
  label: { fontSize: 13, lineHeight: 18, weight: "medium", letterSpacing: 0, fontVariant: [] },
  caption: { fontSize: 12, lineHeight: 16, weight: "regular", letterSpacing: 0, fontVariant: [] },
  figureInline: { fontSize: 17, lineHeight: 24, weight: "medium", letterSpacing: 0, fontVariant: ["tabular-nums"] },
  coord: {
    fontSize: 15,
    lineHeight: 20,
    weight: "regular",
    letterSpacing: 0,
    fontVariant: ["tabular-nums", "stylistic-two"]
  },
  mono: { fontSize: 13, lineHeight: 18, weight: "regular", letterSpacing: 0, fontVariant: [] }
}

// Superseded by `type`; kept until every caller has moved off it.
export const fontSizes = Object.freeze({
  screenTitle: 28,
  statValue: 24,
  cardTitle: 20,
  heading: 18,
  label: 16,
  input: 15,
  body: 14,
  description: 13,
  caption: 12,
  small: 11,
  micro: 10
} as const)
