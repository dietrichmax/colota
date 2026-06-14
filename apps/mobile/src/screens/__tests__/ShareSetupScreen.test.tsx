import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Share } from "react-native"

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ name: "Share Setup", params: {} }),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children
}))

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    Map: (props: any) => R.createElement(View, props),
    Camera: () => null,
    GeoJSONSource: ({ children }: any) => children,
    Layer: () => null,
    Marker: ({ children }: any) => children
  }
})

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#0d9488",
      text: "#000",
      textSecondary: "#6b7280",
      textDisabled: "#d1d5db",
      textOnPrimary: "#fff",
      textLight: "#9ca3af",
      card: "#fff",
      surface: "#fff",
      background: "#fff",
      backgroundElevated: "#f9fafb",
      border: "#e5e7eb",
      borderRadius: 12,
      success: "#22c55e",
      warning: "#f59e0b",
      info: "#3b82f6",
      error: "#ef4444",
      link: "#0d9488",
      placeholder: "#d1d5db",
      overlay: "rgba(0,0,0,0.5)"
    },
    mode: "light"
  })
}))

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: {
      interval: 10,
      distance: 5,
      accuracyThreshold: 50,
      filterInaccurateLocations: true,
      syncInterval: 0,
      retryInterval: 30,
      isOfflineMode: false,
      syncCondition: "any",
      syncSsid: "",
      endpoint: "https://example.com/api",
      apiTemplate: "custom",
      httpMethod: "POST",
      dawarichMode: "single",
      overlandBatchSize: 50,
      fieldMap: {},
      customFields: []
    }
  })
}))

const mockGetAuthConfig = jest.fn()
const mockGetGeofences = jest.fn()
const mockGetProfiles = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getAuthConfig: (...a: any[]) => mockGetAuthConfig(...a),
    getGeofences: (...a: any[]) => mockGetGeofences(...a),
    getProfiles: (...a: any[]) => mockGetProfiles(...a)
  }
}))

jest.mock("../../services/modalService", () => ({ showAlert: jest.fn() }))

import { ShareSetupScreen } from "../ShareSetupScreen"

const NO_AUTH = { authType: "none", username: "", password: "", bearerToken: "", customHeaders: {} }
const BASIC_AUTH = { authType: "basic", username: "user", password: "secret", bearerToken: "", customHeaders: {} }

const decode = (link: string) => JSON.parse(atob(link.split("config=")[1]))

describe("ShareSetupScreen", () => {
  let shareSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthConfig.mockResolvedValue(NO_AUTH)
    mockGetGeofences.mockResolvedValue([])
    mockGetProfiles.mockResolvedValue([])
    shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as any)
  })

  afterEach(() => shareSpy.mockRestore())

  it("shares nothing until a category is toggled on", async () => {
    const { getByText } = render(<ShareSetupScreen />)
    await waitFor(() => expect(mockGetAuthConfig).toHaveBeenCalled())

    fireEvent.press(getByText("Share"))
    expect(shareSpy).not.toHaveBeenCalled()
  })

  it("shares only the categories the user toggles on", async () => {
    const { getByText, getByTestId } = render(<ShareSetupScreen />)
    await waitFor(() => expect(mockGetAuthConfig).toHaveBeenCalled())

    fireEvent(getByTestId("share-tracking"), "valueChange", true)
    fireEvent.press(getByText("Share"))
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1))

    const config = decode(shareSpy.mock.calls[0][0].message)
    expect(config.interval).toBe(10)
    expect(config.endpoint).toBeUndefined() // API not toggled on
    expect(config.auth).toBeUndefined() // credentials not toggled on
  })

  it("disables the credentials toggle when none are configured", async () => {
    const { getByTestId } = render(<ShareSetupScreen />)
    await waitFor(() => expect(mockGetAuthConfig).toHaveBeenCalled())

    const credentials = getByTestId("share-credentials")
    expect(credentials.props.value).toBe(false)
    expect(credentials.props.disabled).toBe(true)
  })

  it("includes credentials when configured and toggled on", async () => {
    mockGetAuthConfig.mockResolvedValue(BASIC_AUTH)
    const { getByTestId, getByText } = render(<ShareSetupScreen />)
    await waitFor(() => expect(getByTestId("share-credentials").props.disabled).toBe(false))

    fireEvent(getByTestId("share-credentials"), "valueChange", true)
    fireEvent.press(getByText("Share"))
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1))

    const config = decode(shareSpy.mock.calls[0][0].message)
    expect(config.auth).toEqual({ type: "basic", username: "user", password: "secret" })
  })
})
