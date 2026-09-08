/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import Svg, { Circle, Path } from "react-native-svg"

type TrackMarkProps = {
  size?: number
  color?: string
  strokeWidth?: number
}

/**
 * The app's mark on Lucide's 24 grid: a track that starts as a solid disc and ends as a ring, the
 * same two terminals the map draws on every trip.
 */
export function TrackMark({ size = 24, color = "currentColor", strokeWidth = 1.5 }: TrackMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 5.07 9.81 3.81 5.21 8.08 3.68 12 6.51 17.49 10.57 20.11 12.72 19.65"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="16" cy="5.07" r="2" fill={color} />
      <Circle cx="16" cy="18.93" r="2.4" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  )
}
