import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Linking } from "react-native"

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

// getBuildConfig only. Any device read from this screen must fail this suite: the phone belongs to
// Android's own About phone and to the log header, not here.
let mockBuildConfig: { VERSION_NAME: string; VERSION_CODE: number; FLAVOR: string } | null
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: { getBuildConfig: () => mockBuildConfig }
}))

const mockShowAlert = jest.fn()
jest.mock("../../services/modalService", () => ({
  showAlert: (...a: unknown[]) => mockShowAlert(...a)
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn() } }))

jest.mock("../../assets/icons/icon.png", () => "mock-icon")

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => null,
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    // The rows must carry the link role that ListItem turns into "Opens {label} in the browser",
    // so the role has to reach the assertion.
    ListItem: ({ label, sub, onPress, testID, accessibilityRole }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, accessibilityRole },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      )
  }
})

import { AboutScreen } from "../AboutScreen"

const COPYRIGHT = /Copyright © 2026 Max Dietrich and contributors\. Colota is free software, with no warranty/

const renderScreen = () => render(<AboutScreen navigation={{} as any} />)

beforeEach(() => {
  jest.clearAllMocks()
  mockBuildConfig = { VERSION_NAME: "1.3.0", VERSION_CODE: 10, FLAVOR: "foss" }
  jest.spyOn(Linking, "openURL").mockResolvedValue(true as any)
})

describe("AboutScreen", () => {
  // The changelog files, Play's crash reports and F-Droid are keyed by the code, and one
  // versionName has shipped under two of them.
  it("prints the app's name and the version line with the build code the changelog files are keyed by", () => {
    const api = renderScreen()

    expect(api.getByText("Colota")).toBeTruthy()
    expect(api.getByText("Version 1.3.0 (10) · FOSS")).toBeTruthy()
  })

  // Play requires the privacy policy link inside the app, so it cannot depend on a bridge module.
  it("says Unknown when the build module did not link, and still renders every legal row", () => {
    mockBuildConfig = null
    const api = renderScreen()

    expect(api.getByText("Version Unknown")).toBeTruthy()
    expect(api.getByTestId("nav-privacy-policy")).toBeTruthy()
    expect(api.getByTestId("nav-license")).toBeTruthy()
    expect(api.getByTestId("nav-source-code")).toBeTruthy()
    expect(api.getByText(COPYRIGHT)).toBeTruthy()
  })

  it("links the privacy policy, the licence and the source, each a link row naming its host", async () => {
    const api = renderScreen()

    fireEvent.press(api.getByTestId("nav-privacy-policy"))
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://colota.app/privacy-policy")
    fireEvent.press(api.getByTestId("nav-license"))
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://github.com/dietrichmax/colota/blob/main/LICENSE")
    fireEvent.press(api.getByTestId("nav-source-code"))
    expect(Linking.openURL).toHaveBeenLastCalledWith("https://github.com/dietrichmax/colota")

    expect(api.getByText("colota.app/privacy-policy")).toBeTruthy()
    expect(api.getByText("GNU AGPLv3")).toBeTruthy()
    expect(api.getByText("github.com/dietrichmax/colota")).toBeTruthy()
    expect(await api.findAllByRole("link")).toHaveLength(3)
    expect(api.queryAllByRole("button")).toHaveLength(0)
  })

  it("reports a link the device refused, because the user pressed it", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"))
    const api = renderScreen()

    fireEvent.press(api.getByTestId("nav-source-code"))

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith("Error", "Could not open the link.", "error"))
  })

  // AGPL section 0 asks for the notice once; the app carried it twice, two screens apart.
  it("carries the copyright and no-warranty notice once, under the License row it points at", () => {
    const api = renderScreen()

    expect(api.getAllByText(COPYRIGHT)).toHaveLength(1)
  })

  // The phone is on Android's About phone and in the log header; the toolchain is in build.gradle
  // at the tag; the map credits are on the map's own dialog, live from the style.
  it("shows nothing about the phone, the toolchain or the map, which the log file and the map's own dialog carry", () => {
    const api = renderScreen()

    for (const gone of [
      "Build",
      "Device",
      "Variant",
      "Target SDK",
      "Kotlin",
      "NDK",
      "Model",
      "Device ID",
      "Copy debug info",
      "Map data",
      "OpenStreetMap",
      "Colota tiles"
    ]) {
      expect(api.queryByText(gone)).toBeNull()
    }
  })
})
