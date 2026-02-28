import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
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
const mockGetSetting = jest.fn().mockResolvedValue("false")
const mockSaveSetting = jest.fn().mockResolvedValue(undefined)
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
    getSetting: (...args: any[]) => mockGetSetting(...args),
    saveSetting: (...args: any[]) => mockSaveSetting(...args),
    getDeviceInfo: (...args: any[]) => mockGetDeviceInfo(...args),
    copyToClipboard: (...args: any[]) => mockCopyToClipboard(...args),
    getNativeLogs: (...args: any[]) => mockGetNativeLogs(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    shareFile: (...args: any[]) => mockShareFile(...args)
  }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn() },
  getLogEntries: jest.fn().mockReturnValue([]),
  setLogCollecting: jest.fn()
}))

jest.mock("../../assets/icons/icon.png", () => "mock-icon")

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
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
    ChevronRight: stub("ChevronRight"),
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
import { setLogCollecting } from "../../utils/logger"

describe("AboutScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSetting.mockResolvedValue("false")
    jest.spyOn(Linking, "openURL").mockResolvedValue(true as any)
  })

  function renderScreen() {
    return render(<AboutScreen navigation={{} as any} />)
  }

  it("renders app title and version", () => {
    const { getByText } = renderScreen()

    expect(getByText("Colota")).toBeTruthy()
    expect(getByText("Version 1.3.0")).toBeTruthy()
  })

  it("shows tap hint after first taps", () => {
    const { getByText } = renderScreen()

    const versionText = getByText("Version 1.3.0")
    fireEvent.press(versionText)

    expect(getByText("6 more taps to enable debug mode")).toBeTruthy()
  })

  it("enables debug mode after 7 taps", async () => {
    const { getByText } = renderScreen()

    const versionText = getByText("Version 1.3.0")
    for (let i = 0; i < 7; i++) {
      fireEvent.press(versionText)
    }

    await waitFor(() => {
      expect(getByText("Debug Mode (tap to hide)")).toBeTruthy()
    })

    expect(mockSaveSetting).toHaveBeenCalledWith("debug_mode_enabled", "true")
    expect(setLogCollecting).toHaveBeenCalledWith(true)
  })

  it("shows debug badge when debug mode is enabled", async () => {
    const { getByText } = renderScreen()

    const versionText = getByText("Version 1.3.0")
    for (let i = 0; i < 7; i++) {
      fireEvent.press(versionText)
    }

    await waitFor(() => {
      expect(getByText("Debug Mode (tap to hide)")).toBeTruthy()
    })
  })

  it("shows BUILD section with SDK info when debug enabled", async () => {
    const { getByText } = renderScreen()

    const versionText = getByText("Version 1.3.0")
    for (let i = 0; i < 7; i++) {
      fireEvent.press(versionText)
    }

    await waitFor(() => {
      expect(getByText("BUILD")).toBeTruthy()
    })

    expect(getByText("FOSS")).toBeTruthy()
    expect(getByText("35 (Android 15)")).toBeTruthy()
    expect(getByText("26 (Android 8.0)")).toBeTruthy()
    expect(getByText("35.0.0")).toBeTruthy()
    expect(getByText("2.0.0")).toBeTruthy()
    expect(getByText("27.0.0")).toBeTruthy()
  })

  it("disables debug mode when debug badge is tapped", async () => {
    const { getByText, queryByText } = renderScreen()

    const versionText = getByText("Version 1.3.0")
    for (let i = 0; i < 7; i++) {
      fireEvent.press(versionText)
    }

    await waitFor(() => {
      expect(getByText("Debug Mode (tap to hide)")).toBeTruthy()
    })

    mockSaveSetting.mockClear()
    ;(setLogCollecting as jest.Mock).mockClear()

    fireEvent.press(getByText("Debug Mode (tap to hide)"))

    await waitFor(() => {
      expect(queryByText("Debug Mode (tap to hide)")).toBeNull()
    })

    expect(mockSaveSetting).toHaveBeenCalledWith("debug_mode_enabled", "false")
    expect(setLogCollecting).toHaveBeenCalledWith(false)
  })

  it("loads persisted debug mode on mount", async () => {
    mockGetSetting.mockResolvedValue("true")

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Debug Mode (tap to hide)")).toBeTruthy()
    })

    expect(mockGetSetting).toHaveBeenCalledWith("debug_mode_enabled", "false")
    expect(setLogCollecting).toHaveBeenCalledWith(true)
  })

  it("opens Privacy Policy URL when link pressed", async () => {
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Privacy Policy"))

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith("https://colota.app/privacy-policy")
    })
  })
})
