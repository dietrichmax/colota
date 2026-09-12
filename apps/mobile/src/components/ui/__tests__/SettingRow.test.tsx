import React from "react"
import { render } from "@testing-library/react-native"
import { Text } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { SettingRow } from "../SettingRow"

describe("SettingRow", () => {
  it("drops the label and hint to the disabled token when disabled", () => {
    // Three geofence rows dimmed the whole row at 0.45 instead, which also faded the
    // control inside it and told a screen reader nothing.
    const { getByText } = render(
      <SettingRow label="WiFi/Ethernet pause" hint="Stop GPS on unmetered networks" disabled>
        <Text>child</Text>
      </SettingRow>
    )

    const flat = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    expect(flat(getByText("WiFi/Ethernet pause")).color).toBe(lightColors.textDisabled)
    expect(flat(getByText("Stop GPS on unmetered networks")).color).toBe(lightColors.textDisabled)
  })

  it("uses the normal ink otherwise", () => {
    const { getByText } = render(
      <SettingRow label="WiFi/Ethernet pause">
        <Text>child</Text>
      </SettingRow>
    )

    const flat = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    expect(flat(getByText("WiFi/Ethernet pause")).color).toBe(lightColors.text)
  })
})
