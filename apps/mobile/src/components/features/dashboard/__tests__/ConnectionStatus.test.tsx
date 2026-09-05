import React from "react"
import { render, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter } from "react-native"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      success: "#22c55e",
      error: "#ef4444",
      warning: "#f59e0b",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      text: "#000",
      card: "#fff",
      border: "#e5e7eb",
      pressedOpacity: 0.6
    }
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

// #546: the chip must never issue its own request - a JS fetch bypasses the native TLS
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

  it("shows 'Connected' when the queue is empty and locations have synced", async () => {
    mockGetStats.mockResolvedValue(stats(0, 5))

    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("Connected")).toBeTruthy())
  })

  it("stays 'Checking' on a backlog with no sync event yet (does not fabricate a status)", async () => {
    mockGetStats.mockResolvedValue(stats(3, 0))

    const { getByText, queryByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    expect(getByText("Checking")).toBeTruthy()
    expect(queryByText("Connected")).toBeNull()
    expect(queryByText("Unreachable")).toBeNull()
  })

  it("shows 'Unreachable' on a sync error event", async () => {
    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

    emit("onSyncError", { message: "send failed", queuedCount: 3 })

    await waitFor(() => expect(getByText("Unreachable")).toBeTruthy())
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

    await waitFor(() => expect(getByText("Connected")).toBeTruthy())
    await act(async () => resolveStale(true))
    expect(getByText("Connected")).toBeTruthy()
  })

  it("shows 'No endpoint' when endpoint is empty", async () => {
    const { getByText } = render(<ConnectionStatus endpoint="" navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("No endpoint")).toBeTruthy())
  })

  it("shows 'No endpoint' when endpoint is null", async () => {
    const { getByText } = render(<ConnectionStatus endpoint={null} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("No endpoint")).toBeTruthy())
  })

  it("shows 'Offline Mode' when offline mode is enabled", async () => {
    mockSettings.isOfflineMode = true

    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(getByText("Offline Mode")).toBeTruthy())
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
})
