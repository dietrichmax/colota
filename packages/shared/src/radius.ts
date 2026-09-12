/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 *
 * Single source of truth for Colota corner radii.
 * Used by: apps/mobile, apps/docs
 */

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999
} as const

export type RadiusName = keyof typeof radius
