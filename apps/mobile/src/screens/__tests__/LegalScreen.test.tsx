import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Linking } from "react-native"

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => null,
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    ListItem: require("../../testing/componentStubs").ListItemStub
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

import { LegalScreen } from "../LegalScreen"

describe("LegalScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as any)
  })

  it("carries the legal detail the About list no longer shows", async () => {
    const { getByText } = render(<LegalScreen navigation={{} as any} />)

    fireEvent.press(getByText("Privacy policy"))
    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith("https://colota.app/privacy-policy")
    })

    expect(getByText("License")).toBeTruthy()
    expect(getByText("GNU AGPLv3")).toBeTruthy()
  })

  it("credits the map data, which the licence requires", async () => {
    const { getByText } = render(<LegalScreen navigation={{} as any} />)

    fireEvent.press(getByText("OpenStreetMap"))
    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith("https://www.openstreetmap.org/copyright")
    })
  })
})
