import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../../../types/global"

jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress, disabled, loading, testID }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, disabled: disabled || loading, accessibilityState: { disabled: disabled || loading } },
        R.createElement(Text, null, title)
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children),
    ListItem: ({ testID, label, sub, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    Notice: ({ testID, variant, title, message }: any) =>
      R.createElement(
        View,
        { testID, accessibilityHint: variant },
        R.createElement(Text, null, title),
        message ? R.createElement(Text, null, message) : null
      ),
    TextField: ({ testID, label, value, onChangeText, placeholder }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        R.createElement(TextInput, { testID, value, onChangeText, placeholder })
      )
  }
})

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors, mode: "light" })
}))

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
    CircleCheckBig: () => R.createElement(View, null),
    ChevronRight: () => R.createElement(View, null)
  }
})

const mockGetStats = jest.fn().mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })
const mockManualFlush = jest.fn().mockResolvedValue(undefined)
const mockClearQueue = jest.fn().mockResolvedValue(5)
const mockGetMostRecentLocation = jest.fn().mockResolvedValue(null)
const mockIsEndpointPrivate = jest.fn().mockResolvedValue(false)
const mockTestEndpoint = jest.fn().mockResolvedValue({ ok: true, status: 200 })

jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...args: any[]) => mockGetStats(...args),
    manualFlush: (...args: any[]) => mockManualFlush(...args),
    clearQueue: (...args: any[]) => mockClearQueue(...args),
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args),
    isPrivateEndpoint: (...args: any[]) => mockIsEndpointPrivate(...args),
    testEndpoint: (...args: any[]) => mockTestEndpoint(...args)
  }
}))

const mockShowChoice = jest.fn().mockResolvedValue(0)
jest.mock("../../../../services/modalService", () => ({
  showChoice: (...args: any[]) => mockShowChoice(...args)
}))

const mockIsEndpointAllowed = jest.fn().mockReturnValue(true)
jest.mock("../../../../utils/settingsValidation", () => ({
  isEndpointAllowed: (...args: any[]) => mockIsEndpointAllowed(...args)
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

const mockNavigation = { navigate: jest.fn() }

describe("ConnectionSettings", () => {
  let mockOnSettingsChange: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsEndpointAllowed.mockReturnValue(true)
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
        navigation={mockNavigation}
      />
    )
  }

  // The screen header already says "Connection", so the first group names what it holds
  // instead of repeating the screen.
  it("heads the first group with what it configures, not the screen name", () => {
    const { getByText } = renderComponent()

    expect(getByText("Server")).toBeTruthy()
  })

  it("shows the offline mode toggle", () => {
    const { getByText } = renderComponent()

    expect(getByText("Offline mode")).toBeTruthy()
    expect(getByText("Save locally, no network sync")).toBeTruthy()
  })

  describe("online mode", () => {
    it("shows the server endpoint field", () => {
      const { getByText } = renderComponent()

      expect(getByText("Server endpoint")).toBeTruthy()
    })

    it("shows the test connection button", () => {
      const { getByText } = renderComponent()

      expect(getByText("Test connection")).toBeTruthy()
    })

    // The row label has to read the same as the header the route paints.
    it("shows the authentication row under its own screen title", () => {
      const { getByText } = renderComponent()

      expect(getByText("Authentication")).toBeTruthy()
    })

    // Plain HTTP to a public host is refused by the native URL guard, so the warning is
    // the only thing that tells a user why nothing will ever upload.
    it("warns about plain HTTP to a public host", async () => {
      mockIsEndpointPrivate.mockResolvedValue(false)
      const { getByText } = renderComponent({}, "http://example.com/api/locations")

      await waitFor(() => {
        expect(getByText("HTTP is only allowed for private addresses and localhost.")).toBeTruthy()
      })
    })

    it("does not warn for an https endpoint", () => {
      const { queryByText } = renderComponent({}, "https://example.com/api/locations")

      expect(queryByText("HTTP is only allowed for private addresses and localhost.")).toBeNull()
    })

    // The button used to be dimmed by an opacity wrapper while still firing; a real
    // disabled state is what keeps a rejected endpoint from being tested.
    it("disables the test button when the endpoint cannot be reached", () => {
      mockIsEndpointAllowed.mockReturnValue(false)
      const { getByTestId } = renderComponent({}, "http://example.com/api")

      expect(getByTestId("test-connection-btn").props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: true })
      )
    })
  })

  describe("offline mode", () => {
    it("hides the server endpoint field", () => {
      const { queryByText } = renderComponent({ isOfflineMode: true })

      expect(queryByText("Server endpoint")).toBeNull()
    })

    it("hides the test connection button", () => {
      const { queryByText } = renderComponent({ isOfflineMode: true })

      expect(queryByText("Test connection")).toBeNull()
    })

    it("hides the authentication row", () => {
      const { queryByText } = renderComponent({ isOfflineMode: true })

      expect(queryByText("Authentication")).toBeNull()
    })
  })

  describe("offline mode toggle with queue", () => {
    it("enables offline mode directly when queue is empty", async () => {
      mockGetStats.mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })
      const { getAllByRole } = renderComponent()

      const toggle = getAllByRole("switch")[0]
      fireEvent.press(toggle)

      await waitFor(() => {
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      })
    })

    it("shows choice dialog when queue has items", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(2) // Cancel
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent.press(toggle)

      await waitFor(() => {
        expect(mockShowChoice).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Unsent locations",
            message: expect.stringContaining("10 locations")
          })
        )
      })
    })

    it("syncs first then enables offline when Sync first chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(0) // Sync first (with endpoint)
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent.press(toggle)

      await waitFor(() => {
        expect(mockManualFlush).toHaveBeenCalled()
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      })
    })

    it("keeps queue and enables offline when Keep chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(1) // Keep in queue (with endpoint)
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent.press(toggle)

      await waitFor(() => {
        expect(mockManualFlush).not.toHaveBeenCalled()
        expect(mockClearQueue).not.toHaveBeenCalled()
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      })
    })

    it("does not enable offline when Cancel chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(2) // Cancel (with endpoint)
      const { getAllByRole } = renderComponent({ endpoint: "https://example.com/api" })

      const toggle = getAllByRole("switch")[0]
      fireEvent.press(toggle)

      await waitFor(() => {
        expect(mockShowChoice).toHaveBeenCalled()
      })
      expect(mockOnSettingsChange).not.toHaveBeenCalled()
    })

    it("disables offline mode directly without dialog", async () => {
      const { getAllByRole } = renderComponent({ isOfflineMode: true })

      const toggle = getAllByRole("switch")[0]
      fireEvent.press(toggle)

      await waitFor(() => {
        expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: false }))
      })
      expect(mockShowChoice).not.toHaveBeenCalled()
    })

    it("omits the Sync first button when no endpoint configured", async () => {
      mockGetStats.mockResolvedValue({ queued: 5, sent: 0, total: 5, today: 5, databaseSizeMB: 0.1 })
      mockShowChoice.mockResolvedValue(0) // Keep in queue (no endpoint, so index 0 = keep)
      const { getAllByRole } = renderComponent({ endpoint: "" }, "")

      const toggle = getAllByRole("switch")[0]
      fireEvent.press(toggle)

      await waitFor(() => {
        expect(mockShowChoice).toHaveBeenCalledWith(
          expect.objectContaining({
            buttons: expect.not.arrayContaining([expect.objectContaining({ text: "Sync first" })])
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

    it("shows native error message when testEndpoint rejects the protocol", async () => {
      mockGetMostRecentLocation.mockResolvedValue(location)
      mockTestEndpoint.mockResolvedValue({
        ok: false,
        status: 0,
        errorMessage: "HTTPS is required for public endpoints. HTTP is only allowed for private/local addresses."
      })
      const { getByText } = renderComponent({}, "http://example.com/api")

      fireEvent.press(getByText("Test connection"))

      await waitFor(() => {
        expect(getByText(/HTTPS is required for public endpoints/)).toBeTruthy()
      })
    })

    it("shows success message when testEndpoint reports ok", async () => {
      mockGetMostRecentLocation.mockResolvedValue(location)
      mockTestEndpoint.mockResolvedValue({ ok: true, status: 200 })
      const { getByText } = renderComponent({}, "https://example.com/api")

      fireEvent.press(getByText("Test connection"))

      await waitFor(() => {
        expect(getByText("Connection successful")).toBeTruthy()
      })
    })

    it("surfaces mTLS handshake error from native", async () => {
      mockGetMostRecentLocation.mockResolvedValue(location)
      mockTestEndpoint.mockResolvedValue({
        ok: false,
        status: 0,
        errorMessage: "TLS handshake failed - server rejected client certificate or cert is expired"
      })
      const { getByText } = renderComponent({}, "https://example.com/api")

      fireEvent.press(getByText("Test connection"))

      await waitFor(() => {
        expect(getByText(/TLS handshake failed/)).toBeTruthy()
      })
    })
  })
})
