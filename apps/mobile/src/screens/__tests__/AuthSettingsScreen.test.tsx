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
    colors: require("@colota/shared").lightColors
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
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Toast: () => null,
    Container: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress, testID }: any) =>
      R.createElement(Pressable, { testID, onPress }, R.createElement(Text, null, title)),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children),
    Notice: ({ testID, title, message }: any) =>
      R.createElement(
        View,
        { testID },
        R.createElement(Text, null, title),
        message ? R.createElement(Text, null, message) : null
      ),
    ListItem: ({ testID, label, sub, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    TextField: ({ testID, label, error, value, onChangeText, placeholder, autoComplete, importantForAutofill }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        error ? R.createElement(Text, null, error) : null,
        R.createElement(TextInput, {
          testID,
          value,
          onChangeText,
          placeholder,
          autoComplete,
          importantForAutofill,
          accessibilityLabel: label
        })
      ),
    ChipGroup: ({ options, onSelect }: any) =>
      R.createElement(
        View,
        null,
        options.map((opt: any) =>
          R.createElement(
            Pressable,
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
        expect(getByText("Secure your endpoint connection")).toBeTruthy()
      })
    })
  })

  describe("auth type changes", () => {
    it("renders all three auth type options", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })
      expect(getByText("Basic auth")).toBeTruthy()
      expect(getByText("Bearer token")).toBeTruthy()
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

    it("switching to Basic auth shows username and password fields", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic auth"))

      expect(getByText("Username")).toBeTruthy()
      expect(getByText("Password")).toBeTruthy()
    })

    it("switching to Bearer token shows token field", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Bearer token"))

      expect(getByText("Token")).toBeTruthy()
    })

    it("switching from Basic auth to Bearer hides username/password, shows token", async () => {
      const { getByText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic auth"))
      expect(getByText("Username")).toBeTruthy()

      fireEvent.press(getByText("Bearer token"))
      expect(queryByText("Username")).toBeNull()
      expect(queryByText("Password")).toBeNull()
      expect(getByText("Token")).toBeTruthy()
    })

    it("switching from Bearer to None hides token field", async () => {
      const { getByText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Bearer token"))
      expect(getByText("Token")).toBeTruthy()

      fireEvent.press(getByText("None"))
      expect(queryByText("Token")).toBeNull()
    })

    it("auth type change triggers immediate save", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic auth"))

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("loads saved Basic auth config and shows fields", async () => {
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

      fireEvent.press(getByText("Basic auth"))

      const usernameInput = getByPlaceholderText("Username")
      fireEvent.changeText(usernameInput, "newuser")

      expect(mockDebouncedSaveAndRestart).toHaveBeenCalled()
    })
  })

  describe("autofill", () => {
    // A username and password are account credentials a password manager should offer to
    // fill; a bearer token and a header value are secrets pasted once, and inviting the
    // autofill sheet onto them puts them into a store the user never chose.
    it("offers autofill on the Basic auth pair and keeps it away from the token", async () => {
      const { getByText, getByLabelText } = renderScreen()

      await waitFor(() => {
        expect(getByText("None")).toBeTruthy()
      })

      fireEvent.press(getByText("Basic auth"))
      expect(getByLabelText("Username").props.autoComplete).toBe("username")
      expect(getByLabelText("Password").props.autoComplete).toBe("password")

      fireEvent.press(getByText("Bearer token"))
      expect(getByLabelText("Token").props.autoComplete).toBe("off")
      expect(getByLabelText("Token").props.importantForAutofill).toBe("no")
    })

    it("keeps autofill away from a custom header value", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "X-Secret": "s3cret" }
      }

      const { getByLabelText } = renderScreen()

      await waitFor(() => {
        expect(getByLabelText("Value")).toBeTruthy()
      })

      expect(getByLabelText("Value").props.autoComplete).toBe("off")
      expect(getByLabelText("Value").props.importantForAutofill).toBe("no")
    })
  })

  describe("custom headers", () => {
    it("shows empty state when no headers configured", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("No custom headers configured")).toBeTruthy()
      })
    })

    it("adds a header row when Add header is pressed", async () => {
      const { getByTestId, getAllByPlaceholderText } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("add-header-btn")).toBeTruthy()
      })

      fireEvent.press(getByTestId("add-header-btn"))

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

    // The remove control is icon-only, so its accessible name has to say which header
    // it drops or Voice Access and TalkBack cannot tell two rows apart.
    it("removes a header from a control named after that header", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "X-Custom": "val" }
      }

      const { getByDisplayValue, getByLabelText, queryByDisplayValue } = renderScreen()

      await waitFor(() => {
        expect(getByDisplayValue("X-Custom")).toBeTruthy()
      })

      fireEvent.press(getByLabelText("Remove header X-Custom"))

      expect(queryByDisplayValue("X-Custom")).toBeNull()
      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("shows duplicate key warning when header names collide", async () => {
      mockAuthConfig = {
        ...DEFAULT_AUTH_CONFIG,
        customHeaders: { "X-One": "a" }
      }

      const { getByText, getByTestId, getAllByPlaceholderText, queryByText } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("add-header-btn")).toBeTruthy()
      })

      // No warning initially
      expect(queryByText(/Duplicate header names/)).toBeNull()

      // Add second header and type same key
      fireEvent.press(getByTestId("add-header-btn"))
      const nameInputs = getAllByPlaceholderText("Header name")
      fireEvent.changeText(nameInputs[1], "X-One")

      expect(getByText(/Duplicate header names/)).toBeTruthy()
    })
  })
})
