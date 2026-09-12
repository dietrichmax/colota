import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { ActivityIndicator } from "react-native"
import { DEFAULT_AUTH_CONFIG, AuthConfig } from "../../types/global"

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
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

const mockDebouncedSaveAndRestart = jest.fn()
const mockImmediateSaveAndRestart = jest.fn()

jest.mock("../../hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    saving: false,
    message: null,
    isError: false,
    debouncedSaveAndRestart: mockDebouncedSaveAndRestart,
    immediateSaveAndRestart: mockImmediateSaveAndRestart
  })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    IconButton: require("../../testing/componentStubs").IconButtonStub,
    TextField: require("../../testing/componentStubs").TextFieldStub,
    RadioRow: ({ testID, label, sub, selected, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, accessibilityRole: "radio", accessibilityState: { checked: selected } },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    FloatingSaveIndicator: () => null,
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress, testID }: any) =>
      R.createElement(Pressable, { onPress, testID }, R.createElement(Text, null, title)),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children)
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { AuthSettingsScreen, withMethod } from "../AuthSettingsScreen"

const lastImmediateConfig = async () => {
  const [saveFn] = mockImmediateSaveAndRestart.mock.calls.at(-1)
  await saveFn()
  return mockSaveAuthConfig.mock.calls.at(-1)[0] as AuthConfig
}
const lastDebouncedConfig = async () => {
  const [saveFn] = mockDebouncedSaveAndRestart.mock.calls.at(-1)
  await saveFn()
  return mockSaveAuthConfig.mock.calls.at(-1)[0] as AuthConfig
}

describe("AuthSettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuthConfig = { ...DEFAULT_AUTH_CONFIG }
  })

  function renderScreen() {
    return render(<AuthSettingsScreen navigation={{} as any} />)
  }

  it("spins while the config loads, never the word", () => {
    mockGetAuthConfig.mockReturnValueOnce(new Promise(() => {}))
    const { UNSAFE_getByType, queryByText } = renderScreen()

    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy()
    expect(queryByText("Loading...")).toBeNull()
  })

  describe("method", () => {
    it("is a radio group whose rows say what each sends, with only the chosen method's fields", async () => {
      const { getByTestId, getByText, queryByText } = renderScreen()

      await waitFor(() => expect(getByTestId("auth-none").props.accessibilityState.checked).toBe(true))
      expect(
        getByText(
          "Sends Authorization: Basic with the username and password encoded, not encrypted. Only safe over https."
        )
      ).toBeTruthy()
      expect(getByText("Sends Authorization: Bearer with the token.")).toBeTruthy()
      expect(queryByText("Username")).toBeNull()
      expect(queryByText("Token")).toBeNull()

      fireEvent.press(getByTestId("auth-basic"))
      expect(getByText("Username")).toBeTruthy()
      expect(getByText("Password")).toBeTruthy()

      fireEvent.press(getByTestId("auth-bearer"))
      expect(queryByText("Username")).toBeNull()
      expect(getByText("Token")).toBeTruthy()
    })

    it("saves a method at once and drops the credentials of the others, so a never-shown secret can be cleared", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, authType: "basic", username: "max", password: "hunter2" }
      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("auth-basic").props.accessibilityState.checked).toBe(true))

      fireEvent.press(getByTestId("auth-bearer"))

      expect(await lastImmediateConfig()).toMatchObject({
        authType: "bearer",
        username: "",
        password: "",
        bearerToken: ""
      })
      expect(withMethod({ ...DEFAULT_AUTH_CONFIG, bearerToken: "t", username: "u" }, "none")).toMatchObject({
        bearerToken: "",
        username: ""
      })
    })

    it("names the storage on the card, not in a footer paragraph", async () => {
      const { findByText } = renderScreen()

      expect(await findByText("Choosing a method removes the credentials stored for the others.")).toBeTruthy()
      expect(await findByText(/Stored encrypted on this device and in encrypted backups/)).toBeTruthy()
    })
  })

  describe("secrets", () => {
    it("never echoes a stored secret: the field is empty and the note says it is set", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, authType: "bearer", bearerToken: "my-secret-token" }
      const { getByTestId, getByText, queryByDisplayValue } = renderScreen()

      await waitFor(() => expect(getByTestId("bearer-token")).toBeTruthy())

      expect(queryByDisplayValue("my-secret-token")).toBeNull()
      expect(getByText("Set · encrypted on this device, in encrypted backups. Type to replace.")).toBeTruthy()
    })

    it("says when nothing is stored yet", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, authType: "basic", username: "max" }
      const { findByText, getByDisplayValue } = renderScreen()

      expect(await findByText("Not set · encrypted once saved.")).toBeTruthy()
      expect(getByDisplayValue("max")).toBeTruthy()
    })

    it("replaces the stored value when typed and keeps it when the draft is cleared", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, authType: "bearer", bearerToken: "old" }
      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("bearer-token")).toBeTruthy())

      fireEvent.changeText(getByTestId("bearer-token"), "new-token")
      expect((await lastDebouncedConfig()).bearerToken).toBe("new-token")

      mockDebouncedSaveAndRestart.mockClear()
      fireEvent.changeText(getByTestId("bearer-token"), "")
      expect(mockDebouncedSaveAndRestart).not.toHaveBeenCalled()
    })

    it("carries a first edit into a second one typed inside the debounce", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, authType: "basic" }
      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("basic-username")).toBeTruthy())

      fireEvent.changeText(getByTestId("basic-username"), "max")
      fireEvent.changeText(getByTestId("basic-password"), "hunter2")

      expect(await lastDebouncedConfig()).toMatchObject({ username: "max", password: "hunter2" })
    })
  })

  describe("custom headers", () => {
    it("says none are set and what a header does", async () => {
      const { findByText } = renderScreen()

      expect(await findByText("None. A custom header is sent with every request.")).toBeTruthy()
    })

    it("adds a row and saves it once a name exists", async () => {
      const { getByTestId, getAllByPlaceholderText, findByTestId } = renderScreen()

      fireEvent.press(await findByTestId("add-header-btn"))
      expect(getAllByPlaceholderText("Name")).toHaveLength(1)

      fireEvent.changeText(getAllByPlaceholderText("Name")[0], "CF-Access-Client-Id")
      fireEvent.changeText(getAllByPlaceholderText("Value")[0], "abc")

      expect((await lastDebouncedConfig()).customHeaders).toEqual({ "CF-Access-Client-Id": "abc" })
      expect(getByTestId("add-header-btn")).toBeTruthy()
    })

    it("loads saved headers with their values, since a name and value pair must be auditable", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, customHeaders: { "CF-Access-Client-Id": "abc123" } }
      const { findByDisplayValue, getByDisplayValue } = renderScreen()

      expect(await findByDisplayValue("CF-Access-Client-Id")).toBeTruthy()
      expect(getByDisplayValue("abc123")).toBeTruthy()
    })

    it("removes a header at once, named for a screen reader", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, customHeaders: { "X-Custom": "val" } }
      const { findByLabelText, queryByDisplayValue } = renderScreen()

      fireEvent.press(await findByLabelText("Remove header X-Custom"))

      expect(queryByDisplayValue("X-Custom")).toBeNull()
      expect((await lastImmediateConfig()).customHeaders).toEqual({})
    })

    it("marks a duplicate name on its own field instead of a banner", async () => {
      mockAuthConfig = { ...DEFAULT_AUTH_CONFIG, customHeaders: { "X-One": "a" } }
      const { findByTestId, getAllByPlaceholderText, queryByText, getByText } = renderScreen()

      fireEvent.press(await findByTestId("add-header-btn"))
      expect(queryByText("Also used above. Only the last value is sent.")).toBeNull()

      fireEvent.changeText(getAllByPlaceholderText("Name")[1], "X-One")

      expect(getByText("Also used above. Only the last value is sent.")).toBeTruthy()
      expect(queryByText(/Duplicate header names/)).toBeNull()
    })
  })
})
