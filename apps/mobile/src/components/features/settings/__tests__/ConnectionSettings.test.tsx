import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../../../types/global"
import type { ServerState } from "../../../../utils/serverState"

jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    ListItem: require("../../../../testing/componentStubs").ListItemStub,
    TextField: require("../../../../testing/componentStubs").TextFieldStub,
    Toggle: function (props: any) {
      return require("react").createElement(require("react-native").Switch, {
        testID: props.testID,
        value: props.value,
        onValueChange: props.onValueChange,
        disabled: props.disabled,
        accessibilityLabel: props.accessibilityLabel
      })
    },
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Button: ({ title, onPress, disabled, loading, testID }: any) =>
      R.createElement(
        Pressable,
        { onPress, disabled, testID, accessibilityRole: "button", accessibilityState: { disabled, busy: loading } },
        R.createElement(Text, null, title)
      ),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        children
      ),
    StateLine: ({ label, caption, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, caption)),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children)
  }
})

const mockGetStats = jest.fn().mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })
const mockManualFlush = jest.fn().mockResolvedValue(undefined)
const mockGetMostRecentLocation = jest.fn().mockResolvedValue(null)
const mockIsEndpointPrivate = jest.fn().mockResolvedValue(false)
const mockTestEndpoint = jest.fn().mockResolvedValue({ ok: true, status: 200 })

jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...args: any[]) => mockGetStats(...args),
    manualFlush: (...args: any[]) => mockManualFlush(...args),
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args),
    isPrivateEndpoint: (...args: any[]) => mockIsEndpointPrivate(...args),
    testEndpoint: (...args: any[]) => mockTestEndpoint(...args)
  }
}))

const mockShowChoice = jest.fn().mockResolvedValue(0)
jest.mock("../../../../services/modalService", () => ({
  showChoice: (...args: any[]) => mockShowChoice(...args)
}))

jest.mock("../../../../services/LocationServicePermission", () => ({
  ensureLocalNetworkPermission: jest.fn().mockResolvedValue(true)
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn() }
}))

import { ConnectionSettings } from "../ConnectionSettings"

const synced: ServerState = {
  icon: "check",
  tone: "success",
  word: "Synced",
  caption: "Last sync 14:02 · queue empty",
  rowSub: "example.com"
}
const location = { latitude: 52.5, longitude: 13.4, accuracy: 10, altitude: 50, speed: 0, battery: 80 }
const mockNavigation = { navigate: jest.fn() } as any

describe("ConnectionSettings", () => {
  let onSettingsLocal: jest.Mock
  let onSettingsChange: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    onSettingsLocal = jest.fn()
    onSettingsChange = jest.fn()
    mockGetMostRecentLocation.mockResolvedValue(location)
    mockIsEndpointPrivate.mockResolvedValue(false)
    mockTestEndpoint.mockResolvedValue({ ok: true, status: 200 })
  })

  function renderComponent(
    overrides?: Partial<Settings>,
    props: Partial<React.ComponentProps<typeof ConnectionSettings>> = {}
  ) {
    const settings = { ...DEFAULT_SETTINGS, endpoint: "https://example.com/api", ...overrides }
    return render(
      <ConnectionSettings
        settings={settings}
        onSettingsLocal={onSettingsLocal}
        onSettingsChange={onSettingsChange}
        server={synced}
        hasFix
        requestSummary="Traccar · GET"
        authSummary="Bearer token"
        certificateSummary="Not set"
        navigation={mockNavigation}
        {...props}
      />
    )
  }

  const endpointField = (api: ReturnType<typeof render>) => api.getByTestId("endpoint-input")

  describe("the server card", () => {
    it("opens with what sync is doing now, then the configuration that produced it", () => {
      const { getByTestId, getByText } = renderComponent()

      expect(getByTestId("server-state")).toBeTruthy()
      expect(getByText("Synced")).toBeTruthy()
      expect(getByText("Last sync 14:02 · queue empty")).toBeTruthy()
      expect(getByText("Offline mode")).toBeTruthy()
      expect(getByText("Server endpoint")).toBeTruthy()
    })

    it("drops the server and its details under offline mode, since a standalone tracker never sends", () => {
      const { getByText, queryByTestId, queryByText } = renderComponent({ isOfflineMode: true })

      expect(getByText("Synced")).toBeTruthy()
      expect(getByText("Offline mode")).toBeTruthy()
      expect(queryByTestId("endpoint-input")).toBeNull()
      expect(queryByTestId("test-connection-btn")).toBeNull()
      expect(queryByText("Server details")).toBeNull()
      expect(queryByTestId("nav-auth-settings")).toBeNull()
    })

    it("shows the template's endpoint shape as the persistent helper", () => {
      const { getByText } = renderComponent({ apiTemplate: "traccar" })

      expect(getByText(/^Example: http:\/\/192\.168\.1\.10:5055\./)).toBeTruthy()
    })

    it("lists the three server details as rows whose sub is the stored value", () => {
      const { getByText, getByTestId } = renderComponent()

      expect(getByText("Traccar · GET")).toBeTruthy()
      expect(getByText("Bearer token")).toBeTruthy()
      expect(getByText("Not set")).toBeTruthy()
      fireEvent.press(getByTestId("nav-request-format"))
      fireEvent.press(getByTestId("nav-auth-settings"))
      fireEvent.press(getByTestId("nav-mtls-settings"))
      expect(mockNavigation.navigate.mock.calls.map((c: any[]) => c[0])).toEqual([
        "Request Format",
        "Auth Settings",
        "mTLS Settings"
      ])
    })
  })

  describe("the endpoint field", () => {
    it("never saves on a keystroke, since every save restarts the service", () => {
      const api = renderComponent()

      fireEvent.changeText(endpointField(api), "https://exam")

      expect(onSettingsChange).not.toHaveBeenCalled()
    })

    it("stores a passing address on blur, local state first, then the immediate save", async () => {
      const api = renderComponent()

      fireEvent.changeText(endpointField(api), "https://tracks.example.org/api")
      fireEvent(endpointField(api), "blur")

      await waitFor(() =>
        expect(onSettingsChange).toHaveBeenCalledWith(
          expect.objectContaining({ endpoint: "https://tracks.example.org/api" })
        )
      )
      expect(onSettingsLocal.mock.invocationCallOrder[0]).toBeLessThan(onSettingsChange.mock.invocationCallOrder[0])
    })

    it("refuses plain http to a public host with an error and stores nothing", async () => {
      const api = renderComponent()

      fireEvent.changeText(endpointField(api), "http://example.com/api")
      fireEvent(endpointField(api), "blur")

      expect(await api.findByText("http is refused for a public host. Use https.")).toBeTruthy()
      expect(onSettingsChange).not.toHaveBeenCalled()
      expect(api.getByTestId("test-connection-btn").props.accessibilityState.disabled).toBe(true)
    })

    it("stores plain http to a private host and says it is not encrypted", async () => {
      mockIsEndpointPrivate.mockResolvedValue(true)
      const api = renderComponent()

      fireEvent.changeText(endpointField(api), "http://192.168.1.10:5055")
      fireEvent(endpointField(api), "blur")

      expect(await api.findByText("Not encrypted: plain http on a private host.")).toBeTruthy()
      expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "http://192.168.1.10:5055" }))
    })

    it("warns when the address carries a key, because settings store it in the clear", async () => {
      const api = renderComponent()

      fireEvent.changeText(endpointField(api), "https://d.example/api?api_key=abc")
      fireEvent(endpointField(api), "blur")

      expect(await api.findByText(/^This address carries a key\./)).toBeTruthy()
      expect(onSettingsChange).toHaveBeenCalled()
    })

    it("names the scheme rule when the text is not an address", async () => {
      const api = renderComponent()

      fireEvent.changeText(endpointField(api), "tracks.example.org")
      fireEvent(endpointField(api), "blur")

      expect(await api.findByText("Starts with http:// or https:// and names a host.")).toBeTruthy()
      expect(onSettingsChange).not.toHaveBeenCalled()
    })

    it("stores an emptied field, since clearing the server is a deliberate delete", async () => {
      const api = renderComponent()

      fireEvent.changeText(endpointField(api), "")
      fireEvent(endpointField(api), "blur")

      await waitFor(() => expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "" })))
      expect(api.getByText("Enter a server endpoint to test.")).toBeTruthy()
    })
  })

  describe("test connection", () => {
    it("is disabled with the reason while nothing has been recorded", () => {
      const { getByText, getByTestId } = renderComponent({}, { hasFix: false })

      expect(getByTestId("test-connection-btn").props.accessibilityState.disabled).toBe(true)
      expect(getByText("Needs one recorded location to send. Start tracking first.")).toBeTruthy()
    })

    it("says what it sends while enabled", () => {
      const { getByText } = renderComponent()

      expect(getByText("Sends your latest recorded location to this endpoint with your credentials.")).toBeTruthy()
    })

    it("reports Reachable with the code and the time, and persists nothing itself", async () => {
      const api = renderComponent()

      fireEvent.press(api.getByTestId("test-connection-btn"))

      expect(await api.findByText("Reachable")).toBeTruthy()
      expect(api.getByText(/^HTTP 200 · /)).toBeTruthy()
      expect(mockTestEndpoint).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://example.com/api" }))
      expect(onSettingsChange).not.toHaveBeenCalled()
    })

    it("reports Not reachable with the server's own sentence, which stays until the next edit", async () => {
      mockTestEndpoint.mockResolvedValue({
        ok: false,
        status: 0,
        errorMessage: "Server certificate is not trusted (self-signed or unknown CA)."
      })
      const api = renderComponent()

      fireEvent.press(api.getByTestId("test-connection-btn"))

      expect(await api.findByText("Not reachable")).toBeTruthy()
      expect(api.getByText(/^No response · /)).toBeTruthy()
      expect(api.getByText(/Server certificate is not trusted/)).toBeTruthy()

      fireEvent.changeText(endpointField(api), "https://example.com/api/v2")
      expect(api.queryByText("Not reachable")).toBeNull()
    })

    it("falls back to the status code when the server sends no sentence", async () => {
      mockTestEndpoint.mockResolvedValue({ ok: false, status: 401 })
      const api = renderComponent()

      fireEvent.press(api.getByTestId("test-connection-btn"))

      expect(await api.findByText("Server returned 401")).toBeTruthy()
      expect(api.getByText(/^HTTP 401 · /)).toBeTruthy()
    })
  })

  describe("offline mode toggle with queue", () => {
    const toggle = (api: ReturnType<typeof render>) => api.getAllByRole("switch")[0]

    it("enables offline mode directly when queue is empty, local state first", async () => {
      mockGetStats.mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })
      const api = renderComponent()

      fireEvent(toggle(api), "valueChange", true)

      await waitFor(() =>
        expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
      )
      expect(onSettingsLocal).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
    })

    it("asks about unsent locations and syncs first when told to", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(0)
      const api = renderComponent()

      fireEvent(toggle(api), "valueChange", true)

      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())
      expect(mockShowChoice).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Unsent locations", message: expect.stringContaining("10 locations") })
      )
      expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isOfflineMode: true }))
    })

    it("does not enable offline when Cancel is chosen", async () => {
      mockGetStats.mockResolvedValue({ queued: 10, sent: 50, total: 60, today: 5, databaseSizeMB: 1 })
      mockShowChoice.mockResolvedValue(2)
      const api = renderComponent()

      fireEvent(toggle(api), "valueChange", true)

      await waitFor(() => expect(mockShowChoice).toHaveBeenCalled())
      expect(onSettingsChange).not.toHaveBeenCalled()
    })

    it("omits Sync first when no endpoint is configured", async () => {
      mockGetStats.mockResolvedValue({ queued: 5, sent: 0, total: 5, today: 5, databaseSizeMB: 0.1 })
      mockShowChoice.mockResolvedValue(0)
      const api = renderComponent({ endpoint: "" })

      fireEvent(toggle(api), "valueChange", true)

      await waitFor(() =>
        expect(mockShowChoice).toHaveBeenCalledWith(
          expect.objectContaining({
            buttons: expect.not.arrayContaining([expect.objectContaining({ text: "Sync first" })])
          })
        )
      )
    })
  })
})
