import React from "react"
import { render, waitFor } from "@testing-library/react-native"
import { Linking } from "react-native"

// --- Mocks ---

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn()
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      text: "#000",
      textSecondary: "#6b7280",
      card: "#fff",
      warning: "#f59e0b",
      border: "#e5e7eb",
      textLight: "#9ca3af",
      success: "#22c55e",
      primaryDark: "#0d9488",
      textOnPrimary: "#fff",
      background: "#fff"
    },
    mode: "light"
  })
}))

jest.mock("../../hooks/useTimeout", () => ({
  useTimeout: () => ({ set: jest.fn(), clear: jest.fn() })
}))

const mockGetBuildConfig = jest.fn().mockReturnValue({
  VERSION_NAME: "1.3.0",
  VERSION_CODE: 10,
  FLAVOR: "foss",
  TARGET_SDK_VERSION: 35,
  MIN_SDK_VERSION: 26,
  COMPILE_SDK_VERSION: 35,
  BUILD_TOOLS_VERSION: "35.0.0",
  KOTLIN_VERSION: "2.0.0",
  NDK_VERSION: "27.0.0"
})
const mockGetDeviceInfo = jest.fn().mockResolvedValue({
  model: "Pixel 8",
  brand: "Google",
  deviceId: "abc123",
  systemVersion: "15",
  apiLevel: 35
})
const mockCopyToClipboard = jest.fn().mockResolvedValue(undefined)
const mockGetNativeLogs = jest.fn().mockResolvedValue([])
const mockWriteFile = jest.fn().mockResolvedValue("/tmp/logs.txt")
const mockShareFile = jest.fn().mockResolvedValue(undefined)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getBuildConfig: (...args: any[]) => mockGetBuildConfig(...args),
    getDeviceInfo: (...args: any[]) => mockGetDeviceInfo(...args),
    copyToClipboard: (...args: any[]) => mockCopyToClipboard(...args),
    getNativeLogs: (...args: any[]) => mockGetNativeLogs(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    shareFile: (...args: any[]) => mockShareFile(...args)
  }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn() }
}))

jest.mock("../../utils/logExport", () => ({
  exportLogs: jest.fn().mockResolvedValue(undefined)
}))

jest.mock("../../assets/icons/icon.png", () => "mock-icon")

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    StatRow: ({ label, value }: any) =>
      R.createElement(View, null, R.createElement(Text, null, label), R.createElement(Text, null, value)),
    ListItem: require("../../testing/componentStubs").ListItemStub,
    Button: function (props: any) {
      return require("react").createElement(
        require("react-native").Pressable,
        { testID: props.testID, onPress: props.onPress, disabled: props.disabled, accessibilityRole: "button" },
        require("react").createElement(require("react-native").Text, null, props.title)
      )
    },
    Toggle: function (props: any) {
      return require("react").createElement(require("react-native").Switch, {
        testID: props.testID,
        value: props.value,
        onValueChange: props.onValueChange,
        disabled: props.disabled,
        accessibilityLabel: props.accessibilityLabel
      })
    },
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Footer: () => R.createElement(View, null),
    Divider: () => R.createElement(View, null)
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  const stub = (name: string) => (_props: any) => R.createElement(Text, null, name)
  return {
    ExternalLink: stub("ExternalLink"),
    Bug: stub("Bug"),
    FileText: stub("FileText"),
    Code: stub("Code"),
    ScrollText: stub("ScrollText"),
    MessageCircle: stub("MessageCircle"),
    Copy: stub("Copy"),
    Check: stub("Check")
  }
})

import { AboutScreen } from "../AboutScreen"

describe("AboutScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as any)
  })

  function renderScreen() {
    return render(<AboutScreen navigation={{} as any} />)
  }

  it("renders app title and version", () => {
    // Colota is both the app title and the section heading now, so the version is what
    // identifies the header.
    const { getAllByText, getByText } = renderScreen()

    expect(getAllByText("Colota").length).toBeGreaterThanOrEqual(1)
    expect(getByText("Version 1.3.0")).toBeTruthy()
  })




  it("shows the build details", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Build")).toBeTruthy()
    })

    expect(getByText("FOSS")).toBeTruthy()
    expect(getByText("35 (Android 15)")).toBeTruthy()
    expect(getByText("26 (Android 8.0)")).toBeTruthy()
    expect(getByText("35.0.0")).toBeTruthy()
    expect(getByText("2.0.0")).toBeTruthy()
    expect(getByText("27.0.0")).toBeTruthy()
  })
})
