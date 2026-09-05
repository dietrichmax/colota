/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 *
 * Stubs shared by the barrel mocks in `__tests__`. A jest.mock factory cannot close over
 * anything, so each one requires this by path from inside the factory.
 */

import React from "react"
import { View, Text, TextInput } from "react-native"

/** Mirrors TextField: the label above, the input, and the message only when error is a string. */
export function TextFieldStub({ label, error, secure: _secure, mono: _mono, style: _style, ...rest }: any) {
  return (
    <View>
      {label ? <Text>{label}</Text> : null}
      <TextInput {...rest} />
      {typeof error === "string" ? <Text>{error}</Text> : null}
    </View>
  )
}
