/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import Svg, { Circle, Path } from "react-native-svg"
import { useLucideContext } from "lucide-react-native"

const VIEW_BOX = 24
const DEFAULT_SIZE = 24
const DEFAULT_STROKE_WIDTH = 2

type RouteHistoryProps = {
  size?: number
  color?: string
  strokeWidth?: number
  absoluteStrokeWidth?: boolean
}

/**
 * The History tab's own mark: a travelled route ending in one terminal ring, drawn on
 * Lucide's 24 grid inside its 2..22 live area with round caps and joins so it reads as a
 * member of the set rather than a guest. Stroke and the absolute-width rule come from the
 * same `LucideProvider` every Lucide glyph reads, so this one cannot drift from them.
 *
 * The provider is unreachable under the lucide Proxy mock in `jest.setup.js`, where the
 * hook resolves to a component, so the defaults below are what a test sees.
 */
export function RouteHistory({
  size = DEFAULT_SIZE,
  color = "currentColor",
  strokeWidth,
  absoluteStrokeWidth
}: RouteHistoryProps) {
  const context = useLucideContext() ?? {}
  const width = strokeWidth ?? context.strokeWidth ?? DEFAULT_STROKE_WIDTH
  const absolute = absoluteStrokeWidth ?? context.absoluteStrokeWidth ?? false
  const stroke = absolute ? (width * VIEW_BOX) / size : width

  return (
    <Svg
      testID="icon-RouteHistory"
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx={6} cy={19} r={3} fill="none" stroke={color} strokeWidth={stroke} />
      <Path
        d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H18"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
