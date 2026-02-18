import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_AUTH_CONFIG, AuthConfig } from "../../types/global"

// --- Mocks ---

let mockAuthConfig: AuthConfig = { ...DEFAULT_AUTH_CONFIG }
const mockSaveAuthConfig = jest.fn().mockResolvedValue(undefined)
const mockGetAuthConfig = jest.fn(() => Promise.resolve(mockAuthConfig))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getAuthConfig: () => mockGetAuthConfig(),
    saveAuthConfig: (...args: any[]) => mockSaveAuthConfig(...args)
  }
}))

const mockRestartTracking = jest.fn().mockResolvedValue(undefined)

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: require("../../types/global").DEFAULT_SETTINGS,
    restartTracking: mockRestartTracking
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
      placeholder: "#9ca3af",
      textOnPrimary: "#fff"
    }
  })
}))

const mockDebouncedSaveAndRestart = jest.fn()
const mockImmediateSaveAndRestart = jest.fn()

jest.mock("../../hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    saving: false,
    saveSuccess: false,
    debouncedSaveAndRestart: mockDebouncedSaveAndRestart,
    immediateSaveAndRestart: mockImmediateSaveAndRestart
  })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, TouchableOpacity } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    FloatingSaveIndicator: () => null,
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    ChipGroup: ({ options, onSelect }: any) =>
      R.createElement(
        View,
        null,
        options.map((opt: any) =>
          R.createElement(
            TouchableOpacity,
            { key: opt.value, onPress: () => onSelect(opt.value) },
            R.createElement(Text, null, opt.label)
          )
        )
      )
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { AuthSettingsScreen } from "../AuthSettingsScreen"

describe("AuthSettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthConfig = { ...DEFAULT_AUTH_CONFIG }
  })

  function renderScreen() {
    return render(<AuthSettingsScreen navigation={{} as any} />)
  }

  describe("loading state", () => {
    it("shows loading text while fetching config", () => {
      // Keep the promise pending
      mockGetAuthConfig.mockReturnValueOnce(new Promise(() => {}))
      const { getByText } = renderScreen()

      expect(getByText("Loading...")).toBeTruthy()
    })

    it("shows content after config is loaded", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Authentication & Headers")).toBeTruthy()
      })
    })
  })

  describe("auth type changes", () => {
    it("renders all three auth type options", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })
      expect(getByText("Basic Auth")).toBeTruthy()
      expect(getByText("Bearer Token")).toBeTruthy()
    })

    it("defaults to None with no credential fields visible", async () => {
      const { queryByText, getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      expect(queryByText("Username")).toBeNull()
      expect(queryByText("Password")).toBeNull()
      expect(queryByText("Token")).toBeNull()
    })

    it("switching to Basic Auth shows username and password fields", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic Auth"))

      expect(getByText("Username")).toBeTruthy()
      expect(getByText("Password")).toBeTruthy()
    })

    it("switching to Bearer Token shows token field", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Bearer Token"))

      expect(getByText("Token")).toBeTruthy()
    })

    it("switching from Basic Auth to Bearer hides username/password, shows token", async () => {
      const { getByText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic Auth"))
      expect(getByText("Username")).toBeTruthy()

      fireEvent.press(getByText("Bearer Token"))
      expect(queryByText("Username")).toBeNull()
      expect(queryByText("Password")).toBeNull()
      expect(getByText("Token")).toBeTruthy()
    })

    it("switching from Bearer to None hides token field", async () => {
      const { getByText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Bearer Token"))
      expect(getByText("Token")).toBeTruthy()

      fireEvent.press(getByText("None"))
      expect(queryByText("Token")).toBeNull()
    })

    it("auth type change triggers immediate save", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic Auth"))

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("loads saved Basic Auth config and shows fields", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        authType: "basic",
        username: "testuser",
        password: "testpass"
      }

      const { getByText, getByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByText("Username")).toBeTruthy()
      })

      expect(getByDisplayValue("testuser")).toBeTruthy()
      expect(getByDisplayValue("testpass")).toBeTruthy()
    })

    it("loads saved Bearer config and shows field", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        authType: "bearer",
        bearerToken: "my-secret-token"
      }

      const { getByText, getByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByText("Token")).toBeTruthy()
      })

      expect(getByDisplayValue("my-secret-token")).toBeTruthy()
    })

    it("typing in username triggers debounced save", async () => {
      const { getByText, getByPlaceholderText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic Auth"))

      const usernameInput = getByPlaceholderText("Username")
      fireEvent.changeText(usernameInput, "newuser")

      expect(mockDebouncedSaveAndRestart).toHaveBeenCalled()
    })
  })

  describe("custom headers", () => {
    it("shows empty state when no headers configured", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("No custom headers configured")).toBeTruthy()
      })
    })

    it("adds a header row when + Add Header is pressed", async () => {
      const { getByText, getAllByPlaceholderText } = renderScreen()

      await waitFor(() => {
        expect(getByText("+ Add Header")).toBeTruthy()
      })

      fireEvent.press(getByText("+ Add Header"))

      expect(getAllByPlaceholderText("Header name")).toHaveLength(1)
      expect(getAllByPlaceholderText("Value")).toHaveLength(1)
    })

    it("loads saved custom headers", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "CF-Access-Client-Id": "abc123" }
      }

      const { getByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByDisplayValue("CF-Access-Client-Id")).toBeTruthy()
      })

      expect(getByDisplayValue("abc123")).toBeTruthy()
    })

    it("removes a header when X is pressed", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "X-Custom": "val" }
      }

      const { getByDisplayValue, getByText, queryByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByDisplayValue("X-Custom")).toBeTruthy()
      })

      fireEvent.press(getByText("X"))

      expect(queryByDisplayValue("X-Custom")).toBeNull()
      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("shows duplicate key warning when header names collide", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "X-One": "a" }
      }

      const { getByText, getAllByPlaceholderText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("+ Add Header")).toBeTruthy()
      })

      // No warning initially
      expect(queryByText(/Duplicate header names/)).toBeNull()

      // Add second header and type same key
      fireEvent.press(getByText("+ Add Header"))
      const nameInputs = getAllByPlaceholderText("Header name")
      fireEvent.changeText(nameInputs[1], "X-One")

      expect(getByText(/Duplicate header names/)).toBeTruthy()
    })
  })
})
