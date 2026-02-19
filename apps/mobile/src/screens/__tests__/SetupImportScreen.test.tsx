import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_AUTH_CONFIG, TRACKING_PRESETS } from "../../types/global"

// --- Mocks ---

const mockSetSettings = jest.fn().mockResolvedValue(undefined)
const mockSaveSetting = jest.fn().mockResolvedValue(undefined)
const mockGetAuthConfig = jest.fn().mockResolvedValue({ ...DEFAULT_AUTH_CONFIG })
const mockSaveAuthConfig = jest.fn().mockResolvedValue(true)
const mockNavigate = jest.fn()
const mockShowAlert = jest.fn()

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getAuthConfig: (...args: any[]) => mockGetAuthConfig(...args),
    saveAuthConfig: (...args: any[]) => mockSaveAuthConfig(...args),
    saveSetting: (...args: any[]) => mockSaveSetting(...args)
  }
}))

jest.mock("../../services/SettingsService", () => ({
  __esModule: true,
  default: {
    updateMultiple: jest.fn().mockResolvedValue(undefined)
  }
}))

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args)
}))

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: { ...require("../../types/global").DEFAULT_SETTINGS },
    setSettings: mockSetSettings
  })
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      info: "#3b82f6",
      success: "#22c55e",
      error: "#ef4444",
      card: "#fff",
      textOnPrimary: "#fff",
      textDisabled: "#d1d5db",
      borderRadius: 12
    }
  })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(Pressable, { onPress, disabled, accessibilityRole: "button" }, R.createElement(Text, null, title))
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

import { SetupImportScreen } from "../SetupImportScreen"

// --- Helpers ---

function encode(obj: object): string {
  return btoa(JSON.stringify(obj))
}

function renderScreen(configParam?: string) {
  return render(
    <SetupImportScreen
      route={{ params: configParam !== undefined ? { config: configParam } : {} }}
      navigation={{ navigate: mockNavigate }}
    />
  )
}

// --- Tests ---

beforeEach(() => {
  jest.clearAllMocks()
})

describe("SetupImportScreen", () => {
  describe("parsing and validation", () => {
    it("shows error when no config param is provided", () => {
      const { getByText } = renderScreen()
      expect(getByText("Invalid Configuration")).toBeTruthy()
      expect(getByText("No configuration data in URL")).toBeTruthy()
    })

    it("shows error for invalid base64", () => {
      const { getByText } = renderScreen("!!!not-base64!!!")
      expect(getByText("Invalid Configuration")).toBeTruthy()
    })

    it("shows error for valid base64 but invalid JSON", () => {
      const { getByText } = renderScreen(btoa("not json"))
      expect(getByText("Invalid Configuration")).toBeTruthy()
    })

    it("shows error when config has no valid settings", () => {
      const { getByText } = renderScreen(encode({ unknownKey: "value" }))
      expect(getByText("Invalid Configuration")).toBeTruthy()
      expect(getByText("No valid settings found in configuration")).toBeTruthy()
    })

    it("parses valid endpoint config", () => {
      const { getByText } = renderScreen(encode({ endpoint: "https://my-server.com/api" }))
      expect(getByText("Import Configuration")).toBeTruthy()
      expect(getByText("Endpoint")).toBeTruthy()
      expect(getByText("https://my-server.com/api")).toBeTruthy()
    })

    it("parses tracking settings", () => {
      const { getByText } = renderScreen(encode({ interval: 10, distance: 5, syncInterval: 0 }))
      expect(getByText("10s")).toBeTruthy()
      expect(getByText("5m")).toBeTruthy()
      expect(getByText("Instant")).toBeTruthy()
    })

    it("parses API settings", () => {
      const { getByText } = renderScreen(encode({ apiTemplate: "owntracks", httpMethod: "POST" }))
      expect(getByText("owntracks")).toBeTruthy()
      expect(getByText("POST")).toBeTruthy()
    })

    it("parses auth settings with masked token", () => {
      const { getByText } = renderScreen(encode({ auth: { type: "bearer", bearerToken: "abcdefghijkl" } }))
      expect(getByText("bearer")).toBeTruthy()
      // Token should be masked: first 4 + dots + last 4
      expect(getByText(/abcd.*ijkl/)).toBeTruthy()
    })

    it("parses custom headers", () => {
      const { getByText } = renderScreen(encode({ customHeaders: { "X-Api-Key": "secret" } }))
      expect(getByText("1 headers")).toBeTruthy()
    })

    it("rejects invalid interval (negative)", () => {
      const { getByText } = renderScreen(encode({ interval: -5 }))
      expect(getByText("Invalid Configuration")).toBeTruthy()
    })

    it("rejects invalid auth type", () => {
      const { getByText } = renderScreen(encode({ auth: { type: "oauth" } }))
      expect(getByText("Invalid Configuration")).toBeTruthy()
    })

    it("rejects invalid API template", () => {
      const { getByText } = renderScreen(encode({ apiTemplate: "invalid" }))
      expect(getByText("Invalid Configuration")).toBeTruthy()
    })

    it("counts settings correctly in subtitle", () => {
      const { getByText } = renderScreen(encode({ endpoint: "https://test.com", interval: 10 }))
      expect(getByText(/2 settings/)).toBeTruthy()
    })

    it("shows singular 'setting' for single entry", () => {
      const { getByText } = renderScreen(encode({ endpoint: "https://test.com" }))
      // Text is split across nodes: "A setup link wants to apply " + "1" + " setting"
      expect(getByText(/1/)).toBeTruthy()
      expect(getByText(/setting$/)).toBeTruthy()
    })
  })

  describe("apply configuration", () => {
    it("applies settings and navigates to Dashboard", async () => {
      const config = { endpoint: "https://test.com", interval: 15 }
      const { getByText } = renderScreen(encode(config))

      fireEvent.press(getByText("Apply Configuration"))

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          "Configuration Applied",
          "Settings have been updated successfully.",
          "success"
        )
      })

      expect(mockNavigate).toHaveBeenCalledWith("Dashboard")
      expect(mockSetSettings).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: "https://test.com", interval: 15, hasCompletedSetup: true })
      )
    })

    it("applies auth config when provided", async () => {
      const config = { endpoint: "https://test.com", auth: { type: "bearer", bearerToken: "mytoken" } }
      const { getByText } = renderScreen(encode(config))

      fireEvent.press(getByText("Apply Configuration"))

      await waitFor(() => {
        expect(mockSaveAuthConfig).toHaveBeenCalledWith(
          expect.objectContaining({ authType: "bearer", bearerToken: "mytoken" })
        )
      })
    })

    it("marks hasCompletedSetup as true", async () => {
      const { getByText } = renderScreen(encode({ endpoint: "https://test.com" }))

      fireEvent.press(getByText("Apply Configuration"))

      await waitFor(() => {
        expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({ hasCompletedSetup: true }))
      })
    })

    it("sets syncPreset to 'custom' when values don't match a preset", async () => {
      const config = { interval: 15, distance: 3, syncInterval: 120 }
      const { getByText } = renderScreen(encode(config))

      fireEvent.press(getByText("Apply Configuration"))

      await waitFor(() => {
        expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({ syncPreset: "custom" }))
      })
    })

    it("sets syncPreset to matching preset when values match", async () => {
      const balanced = TRACKING_PRESETS.balanced
      const config = {
        interval: balanced.interval,
        distance: balanced.distance,
        syncInterval: balanced.syncInterval,
        retryInterval: balanced.retryInterval
      }
      const { getByText } = renderScreen(encode(config))

      fireEvent.press(getByText("Apply Configuration"))

      await waitFor(() => {
        expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({ syncPreset: "balanced" }))
      })
    })

    it("shows error alert on failure", async () => {
      mockSetSettings.mockRejectedValueOnce(new Error("fail"))
      const { getByText } = renderScreen(encode({ endpoint: "https://test.com" }))

      fireEvent.press(getByText("Apply Configuration"))

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to apply configuration. Please try again.", "error")
      })
    })
  })

  describe("cancel", () => {
    it("navigates to Dashboard on cancel", () => {
      const { getByText } = renderScreen(encode({ endpoint: "https://test.com" }))
      fireEvent.press(getByText("Cancel"))
      expect(mockNavigate).toHaveBeenCalledWith("Dashboard")
    })

    it("navigates to Dashboard on Go Back (error state)", () => {
      const { getByText } = renderScreen()
      fireEvent.press(getByText("Go Back"))
      expect(mockNavigate).toHaveBeenCalledWith("Dashboard")
    })
  })
})
