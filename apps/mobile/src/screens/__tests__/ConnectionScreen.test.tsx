import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_AUTH_CONFIG } from "../../types/global"

let mockSettings = { ...require("../../types/global").DEFAULT_SETTINGS, endpoint: "https://tracks.example.org/api" }
const mockSetSettings = jest.fn()
const mockUpdateSettingsLocal = jest.fn()
const mockRestartTracking = jest.fn()

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    setSettings: mockSetSettings,
    updateSettingsLocal: mockUpdateSettingsLocal,
    restartTracking: mockRestartTracking
  })
}))

const mockImmediateSaveAndRestart = jest.fn()
jest.mock("../../hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    saving: false,
    message: null,
    isError: false,
    debouncedSaveAndRestart: jest.fn(),
    immediateSaveAndRestart: mockImmediateSaveAndRestart
  })
}))

const mockGetStats = jest.fn()
const mockIsNetworkAvailable = jest.fn()
const mockGetMostRecentLocation = jest.fn()
const mockGetAuthConfig = jest.fn()
const mockGetClientCertInfo = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...a: unknown[]) => mockGetStats(...a),
    isNetworkAvailable: (...a: unknown[]) => mockIsNetworkAvailable(...a),
    getMostRecentLocation: (...a: unknown[]) => mockGetMostRecentLocation(...a),
    getAuthConfig: (...a: unknown[]) => mockGetAuthConfig(...a),
    getClientCertInfo: (...a: unknown[]) => mockGetClientCertInfo(...a)
  }
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react")
    R.useEffect(() => {
      const cleanup = cb()
      return typeof cleanup === "function" ? cleanup : undefined
    }, [cb])
  }
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn() } }))

jest.mock("../../components", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { Container: ({ children }: any) => R.createElement(View, null, children) }
})

jest.mock("../../components/ui/FloatingSaveIndicator", () => ({ FloatingSaveIndicator: () => null }))

jest.mock("../../components/features/settings/ConnectionSettings", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    ConnectionSettings: (props: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, `word:${props.server.word}`),
        R.createElement(Text, null, `caption:${props.server.caption}`),
        R.createElement(Text, null, `fix:${props.hasFix}`),
        R.createElement(Text, null, `request:${props.requestSummary}`),
        R.createElement(Text, null, `auth:${props.authSummary}`),
        R.createElement(Text, null, `cert:${props.certificateSummary}`),
        R.createElement(Pressable, {
          testID: "save",
          onPress: () => {
            const next = { ...props.settings, endpoint: "https://new.example/api" }
            props.onSettingsLocal(next)
            props.onSettingsChange(next)
          }
        })
      )
  }
})

import { ConnectionScreen, authSummary } from "../ConnectionScreen"

const mockProps = { navigation: { navigate: jest.fn() } as any, route: { params: undefined } as any }

beforeEach(() => {
  jest.clearAllMocks()
  mockSettings = { ...require("../../types/global").DEFAULT_SETTINGS, endpoint: "https://tracks.example.org/api" }
  mockGetStats.mockResolvedValue({
    queued: 38,
    sent: 400,
    total: 438,
    today: 5,
    databaseSizeMB: 1,
    lastSyncTime: 0,
    lastSyncError: "HTTP 401 Unauthorized"
  })
  mockIsNetworkAvailable.mockResolvedValue(true)
  mockGetMostRecentLocation.mockResolvedValue({ latitude: 1, longitude: 2 })
  mockGetAuthConfig.mockResolvedValue({ ...DEFAULT_AUTH_CONFIG, authType: "bearer", customHeaders: { A: "1", B: "2" } })
  mockGetClientCertInfo.mockResolvedValue({ configured: false })
})

describe("ConnectionScreen", () => {
  it("reads the server state on focus and hands the card what sync is doing now", async () => {
    const { findByText, getByText } = render(<ConnectionScreen {...mockProps} />)

    expect(await findByText("word:Sync failing")).toBeTruthy()
    expect(getByText("caption:HTTP 401 Unauthorized · 38 queued · last success never")).toBeTruthy()
    expect(getByText("fix:true")).toBeTruthy()
  })

  it("prints each detail row's stored value as its sub", async () => {
    mockSettings = { ...mockSettings, apiTemplate: "traccar", httpMethod: "GET" }
    const { findByText, getByText } = render(<ConnectionScreen {...mockProps} />)

    expect(await findByText("auth:Bearer token · 2 headers")).toBeTruthy()
    expect(getByText("request:Traccar · GET")).toBeTruthy()
    expect(getByText("cert:Not set")).toBeTruthy()
  })

  it("wires a change to local state then the immediate save that restarts tracking", async () => {
    const { getByTestId, findByText } = render(<ConnectionScreen {...mockProps} />)
    await findByText("fix:true")

    fireEvent.press(getByTestId("save"))

    expect(mockUpdateSettingsLocal).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://new.example/api" })
    )
    await waitFor(() => expect(mockImmediateSaveAndRestart).toHaveBeenCalledTimes(1))
    const [save, restart] = mockImmediateSaveAndRestart.mock.calls[0]
    save()
    restart()
    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://new.example/api" }))
    expect(mockRestartTracking).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://new.example/api" }))
  })
})

describe("authSummary", () => {
  it("names the method and counts headers only when there are some", () => {
    expect(authSummary({ ...DEFAULT_AUTH_CONFIG })).toBe("None")
    expect(authSummary({ ...DEFAULT_AUTH_CONFIG, authType: "basic", customHeaders: { A: "1" } })).toBe(
      "Basic auth · 1 header"
    )
    expect(authSummary(null)).toBe("")
  })
})
