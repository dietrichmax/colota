/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { type StyleProp, type ViewStyle } from "react-native"
import { ListItem } from "./ListItem"

interface SettingRowProps {
  label: string
  hint?: string
  children: React.ReactNode
  divider?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function SettingRow({ label, hint, children, divider = false, style, testID }: SettingRowProps) {
  return <ListItem label={label} sub={hint} trailing={children} divider={divider} style={style} testID={testID} />
}
