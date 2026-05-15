import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../../../types/global"

jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(Pressable, { onPress, disabled }, R.createElement(Text, null, title)),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        children
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children)
  }
})

jest.mock("../../../ui/SettingRow", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        children
      )
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    CheckCircle: () => R.createElement(View, null),
    ChevronRight: () => R.createElement(View, null)
  }
})

const mockGetStats = jest.fn().mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })
const mockManualFlush = jest.fn().mockResolvedValue(undefined)
const mockClearQueue = jest.fn().mockResolvedValue(5)
const mockGetMostRecentLocation = jest.fn().mockResolvedValue(null)
const mockGetAuthHeaders = jest.fn().mockResolvedValue({})
const mockIsNetworkAvailable = jest.fn().mockResolvedValue(true)
const mockIsValidEndpointProtocol = jest.fn().mockResolvedValue(true)
const mockIsEndpointPrivate = jest.fn().mockResolvedValue(false)

jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...args: any[]) => mockGetStats(...args),
    manualFlush: (...args: any[]) => mockManualFlush(...args),
    clearQueue: (...args: any[]) => mockClearQueue(...args),
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args),
    getAuthHeaders: (...args: any[]) => mockGetAuthHeaders(...args),
    isNetworkAvailable: (...args: any[]) => mockIsNetworkAvailable(...args),
    isValidEndpointProtocol: (...args: any[]) => mockIsValidEndpointProtocol(...args),
    isPrivateEndpoint: (...args: any[]) => mockIsEndpointPrivate(...args)
  }
}))

const mockShowChoice = jest.fn().mockResolvedValue(0)
jest.mock("../../../../services/modalService", () => ({
  showChoice: (...args: any[]) => mockShowChoice(...args)
}))

jest.mock("../../../../utils/settingsValidation", () => ({
  isEndpointAllowed: () => true
}))

jest.mock("../../../../services/LocationServicePermission", () => ({
  ensureLocalNetworkPermission: jest.fn().mockResolvedValue(true)
}))

jest.mock("../../../../hooks/useTimeout", () => ({
  useTimeout: () => ({ set: jest.fn(), clear: jest.fn() })
}))

jest.mock("../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() }
}))

import { ConnectionSettings } from "../ConnectionSettings"

const mockColors = {
  primary: "#0d9488",
  primaryDark: "#115E59",
  text: "#000",
  textSecondary: "#6b7280",
  textLight: "#9ca3af",
  background: "#fff",
  border: "#e5e7eb",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  placeholder: "#9ca3af",
  card: "#fff"
} as any

const mockNavigation = { navigate: jest.fn() }

describe("ConnectionSettings", () => {
  let mockOnSettingsChange: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockOnSettingsChange = jest.fn()
  })

  function renderComponent(overrides?: Partial<Settings>, endpointInput = "https://example.com/api/locations") {
    const settings = { ...DEFAULT_SETTINGS, ...overrides }
    return render(
      <ConnectionSettings
        settings={settings}
        endpointInput={endpointInput}
        onEndpointInputChange={jest.fn()}
        onSettingsChange={mockOnSettingsChange}
        colors={mockColors}
        navigation={mockNavigation}
      />
    )
  }

  it("renders Connection section title", () => {
    const { getByText } = renderComponent()

    expect(getByText("Connection")).toBeTruthy()
  })

  it("shows Offline Mode toggle", () => {
    const { getByText } = renderComponent()

    expect(getByText("Offline Mode")).toBeTruthy()
    expect(getByText("Save locally, no network sync")).toBeTruthy()
  })

  describe("online mode", () => {
    it("shows Server Endpoint input", () => {
      const { getByText } = renderComponent()

      expect(getByText("Server Endpoint")).toBeTruthy()
    })

    it("shows Test Connection button", () => {
      const { getByText } = renderComponent()

      expect(getByText("Test Connection")).toBeTruthy()
    })

    it("shows Authentication & Headers link", () => {
      const { getByText } = renderComponent()

      expect(getByText("Authentication & Headers")).toBeTruthy()
    })

    it("shows HTTPS badge for https endpoint", () => {
      const { getByText } = renderComponent({}, "https://example.com/api/locations")

      expect(getByText("HTTPS")).toBeTruthy()
    })

    it("shows HTTP badge for http endpoint", () => {
      const { getByText } = renderComponent({}, "http://192.168.1.1/api/locations")

      expect(getByText("HTTP")).toBeTruthy()
    })
  })

  describe("offline mode", () => {
    it("hides Server Endpoint input", () => {
      const { queryByText } = renderComponent({ isOfflineMode: true })

      expect(queryByText("Server Endpoint")).toBeNull()
    })

    it("hides Test Connection button", () => {
      const { queryByText } = renderComponent({ isOfflineMode: true })

      expect(queryByText("Test Connection")).toBeNull()
    })

    it("hides Authentication & Headers link", () => {
      const { queryByText } = renderComponent({ isOfflineMode: true })

      expect(queryByText("Authentication & Headers")).toBeNull()
    })
  })

  describe("offline mode toggle with queue", () => {
    it("enables offline mode directly when queue is empty", async () => {
      mockGetStats.mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })
      const { getAllByRole } = renderComponent()

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", true)

      await waitFor(() => {
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      })
    })

    it("shows choice dialog when queue has items", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(3) // Cancel
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", true)

      await waitFor(() => {
        expect(mockShowChoice).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Unsent Locations",
            message: expect.stringContaining("10 locations")
          })
        )
      })
    })

    it("syncs first then enables offline when Sync First chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(0) // Sync First (with endpoint)
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", true)

      await waitFor(() => {
        expect(mockManualFlush).toHaveBeenCalled()
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      })
    })

    it("keeps queue and enables offline when Keep chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(1) // Keep in Queue (with endpoint)
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", true)

      await waitFor(() => {
        expect(mockManualFlush).not.toHaveBeenCalled()
        expect(mockClearQueue).not.toHaveBeenCalled()
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      })
    })

    it("deletes queue and enables offline when Delete chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(2) // Delete Queue (with endpoint)
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", true)

      await waitFor(() => {
        expect(mockClearQueue).toHaveBeenCalled()
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      })
    })

    it("does not enable offline when Cancel chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(3) // Cancel (with endpoint)
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", true)

      await waitFor(() => {
        expect(mockShowChoice).toHaveBeenCalled()
      })
      expect(mockOnSettingsChange).not.toHaveBeenCalled()
    })

    it("disables offline mode directly without dialog", async () => {
      const { getAllByRole } = renderComponent({ isOfflineMode: true })

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", false)

      await waitFor(() => {
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: false }))
      })
      expect(mockShowChoice).not.toHaveBeenCalled()
    })

    it("omits Sync First button when no endpoint configured", async () => {
      mockGetStats.mockResolvedValue({ queued: 5, sent: 0, total: 5, today: 5, databaseSizeMB: 0.1 })
      mockShowChoice.mockResolvedValue(0) // Keep in Queue (no endpoint, so index 0 = keep)
      const { getAllByRole } = renderComponent({ endpoint: "" }, "")

      const toggle = getAllByRole("switch")[0]
      fireEvent(toggle, "valueChange", true)

      await waitFor(() => {
        expect(mockShowChoice).toHaveBeenCalledWith(
          expect.objectContaining({
            buttons: expect.not.arrayContaining([expect.objectContaining({ text: "Sync First" })])
          })
        )
      })
    })
  })

  describe("test connection HTTPS enforcement", () => {
    const location = {
      latitude: 52.5,
      longitude: 13.4,
      accuracy: 10,
      altitude: 50,
      speed: 0,
      battery: 80,
      batteryStatus: 2,
      bearing: 0
    }

    it("blocks when native protocol check rejects endpoint", async () => {
      mockGetMostRecentLocation.mockResolvedValue(location)
      mockIsValidEndpointProtocol.mockResolvedValue(false)
      const { getByText } = renderComponent({}, "http://example.com/api")

      fireEvent.press(getByText("Test Connection"))

      await waitFor(() => {
        expect(getByText(/HTTPS is required for public endpoints/)).toBeTruthy()
      })
    })

    it("allows when native protocol check accepts endpoint", async () => {
      mockGetMostRecentLocation.mockResolvedValue(location)
      mockIsValidEndpointProtocol.mockResolvedValue(true)
      const { queryByText, getByText } = renderComponent({}, "https://example.com/api")

      fireEvent.press(getByText("Test Connection"))

      await waitFor(() => {
        expect(queryByText(/HTTPS is required/)).toBeNull()
      })
    })
  })
})
