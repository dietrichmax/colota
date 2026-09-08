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
    // Not the shared stub: this screen's rows must carry the link role that ListItem turns into
    // "Opens {label} in the browser", so the role has to reach the assertion.
    ListItem: ({ label, sub, onPress, testID, accessibilityRole }: any) =>
      R.createElement(
        require("react-native").Pressable,
        { testID, onPress, accessibilityRole },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      )
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

  it("marks every row a link, which is what ListItem turns into an in-the-browser hint", async () => {
    const { findAllByRole, queryAllByRole } = render(<LegalScreen navigation={{} as any} />)

    expect(await findAllByRole("link")).toHaveLength(5)
    expect(queryAllByRole("button")).toHaveLength(0)
  })
})
