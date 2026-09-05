import React from "react"
import { render, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors
  })
}))

const mockSettings = { isOfflineMode: false }
jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({ settings: mockSettings })
}))

const mockIsNetworkAvailable = jest.fn().mockResolvedValue(true)
const mockGetStats = jest.fn()
jest.mock("../../../../services/NativeLocationService", () => ({
  isNetworkAvailable: (...args: any[]) => mockIsNetworkAvailable(...args),
  getStats: (...args: any[]) => mockGetStats(...args)
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

// #546: the row must never issue its own request - a JS fetch bypasses the native TLS
// trust and breaks custom-CA / mTLS users.
const mockFetch = jest.fn()
;(globalThis as any).fetch = mockFetch

import { ConnectionStatus } from "../ConnectionStatus"

const mockNavigation = { navigate: jest.fn() }
const stats = (queued: number, sent: number) => ({ queued, sent, total: sent, today: 0, databaseSizeMB: 0 })
const emit = (event: string, payload: object) =>
  act(() => {
    DeviceEventEmitter.emit(event, payload)
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockSettings.isOfflineMode = false
  mockIsNetworkAvailable.mockResolvedValue(true)
  mockGetStats.mockResolvedValue(stats(0, 0))
})

describe("ConnectionStatus", () => {
  const url = "https://example.com/api/locations"

  it("shows 'Checking' until a sync result is known", async () => {
    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    expect(getByText("Checking")).toBeTruthy()
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    expect(getByText("Checking")).toBeTruthy()
  })

  it("stamps 'Connected' with the time the exchange settled", async () => {
    mockGetStats.mockResolvedValue(stats(0, 5))

    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText(/^Connected · /)).toBeTruthy())
  })

  it("stays 'Checking' on a backlog with no sync event yet (does not fabricate a status)", async () => {
    mockGetStats.mockResolvedValue(stats(3, 0))

    const { getByText, queryByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    expect(getByText("Checking")).toBeTruthy()
    expect(queryByText(/Connected/)).toBeNull()
    expect(queryByText(/Unreachable/)).toBeNull()
  })

  it("shows 'Unreachable' on a sync error event", async () => {
    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

    emit("onSyncError", { message: "send failed", queuedCount: 3 })

    await waitFor(() => expect(getByText(/^Unreachable · /)).toBeTruthy())
  })

  it("never performs a network request itself", async () => {
    mockGetStats.mockResolvedValue(stats(0, 5))

    render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("a stale run from before the endpoint loaded does not clobber Connected", async () => {
    // The empty-endpoint run resolves after the endpoint loads; it must not flip back to "No endpoint".
    let resolveStale: (v: boolean) => void = () => {}
    mockIsNetworkAvailable
      .mockImplementationOnce(() => new Promise<boolean>((r) => (resolveStale = r)))
      .mockResolvedValue(true)
    mockGetStats.mockResolvedValue(stats(0, 5))

    const { getByText, rerender } = render(<ConnectionStatus endpoint="" navigation={mockNavigation} />)
    rerender(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText(/^Connected · /)).toBeTruthy())
    await act(async () => resolveStale(true))
    expect(getByText(/^Connected · /)).toBeTruthy()
  })

  it("shows 'No endpoint' with no clock, because nothing was exchanged", async () => {
    const { getByText } = render(<ConnectionStatus endpoint="" navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("No endpoint")).toBeTruthy())
  })

  it("shows 'No endpoint' when endpoint is null", async () => {
    const { getByText } = render(<ConnectionStatus endpoint={null} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("No endpoint")).toBeTruthy())
  })

  it("shows 'Offline mode' when offline mode is enabled", async () => {
    mockSettings.isOfflineMode = true

    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("Offline mode")).toBeTruthy())
  })

  it("shows 'Device offline' when the device has no network", async () => {
    mockIsNetworkAvailable.mockResolvedValue(false)

    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("Device offline")).toBeTruthy())
  })

  it("displays the host portion of the endpoint URL", async () => {
    const { getByText } = render(
      <ConnectionStatus endpoint="https://my-server.com/api/locations" navigation={mockNavigation} />
    )

    expect(getByText("my-server.com")).toBeTruthy()
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
  })

  it("displays 'Server' when endpoint is empty", async () => {
    const { getByText } = render(<ConnectionStatus endpoint="" navigation={mockNavigation} />)

    expect(getByText("Server")).toBeTruthy()
    await waitFor(() => expect(getByText("No endpoint")).toBeTruthy())
  })

  // The dot is the only place the status hue survives, so the row's text can stay ink and
  // align with the rest of the sheet instead of starting at an icon column.
  it("carries the status hue on an inline dot", async () => {
    mockGetStats.mockResolvedValue(stats(0, 5))

    const { getByTestId } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    const dots = getByTestId("connection-status").findAll(
      (node: any) =>
        node.props.importantForAccessibility === "no" &&
        node.props.style?.some?.((s: any) => s?.backgroundColor === lightColors.success)
    )
    expect(dots.length).toBeGreaterThan(0)
  })
})
