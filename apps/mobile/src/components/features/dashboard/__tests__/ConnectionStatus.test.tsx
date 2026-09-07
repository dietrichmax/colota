import React from "react"
import { render, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter, StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { size, space } from "../../../../constants"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
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

  it("a healthy server shows the dot and host alone, while a screen reader still hears Connected", async () => {
    mockGetStats.mockResolvedValue(stats(0, 5))

    const { getByRole, queryByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(getByRole("button").props.accessibilityLabel).toBe("example.com, Connected"))
    expect(queryByText(/Connected/)).toBeNull()
    expect(queryByText(/Checking/)).toBeNull()
  })

  it("a backlog on a reachable server shows only the count, because the count is the news", async () => {
    mockGetStats.mockResolvedValue(stats(0, 400))
    const { getByRole, getByText, queryByText } = render(
      <ConnectionStatus endpoint="https://tracks.example.org" navigation={mockNavigation} />
    )
    await waitFor(() => expect(getByRole("button").props.accessibilityLabel).toBe("tracks.example.org, Connected"))

    mockGetStats.mockResolvedValue(stats(12, 400))
    emit("onLocationUpdate", {})

    await waitFor(() => expect(getByText("12 queued")).toBeTruthy())
    expect(queryByText(/Connected/)).toBeNull()
    expect(getByRole("button").props.accessibilityLabel).toBe("tracks.example.org, Connected · 12 queued")
  })

  it("stays 'Checking' on a backlog with no sync event yet (does not fabricate a status)", async () => {
    mockGetStats.mockResolvedValue(stats(3, 0))

    const { getByText, queryByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
    // The queue rides on the same line, so the status is a prefix rather than the whole string.
    expect(getByText(/^Checking/)).toBeTruthy()
    expect(queryByText(/Connected/)).toBeNull()
    expect(queryByText(/Unreachable/)).toBeNull()
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

    const { getByRole, rerender } = render(<ConnectionStatus endpoint="" navigation={mockNavigation} />)
    rerender(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    const connected = "example.com, Connected"
    await waitFor(() => expect(getByRole("button").props.accessibilityLabel).toBe(connected))
    await act(async () => resolveStale(true))
    expect(getByRole("button").props.accessibilityLabel).toBe(connected)
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

  it("carries the queue on the row, because a reachable server can still be falling behind", async () => {
    mockGetStats.mockResolvedValue(stats(12, 400))
    const { getByText } = render(<ConnectionStatus endpoint="https://tracks.example.org" navigation={mockNavigation} />)

    await waitFor(() => expect(getByText(/12 queued/)).toBeTruthy())
  })

  it("says nothing about the queue when there is none, so the count means something when it appears", async () => {
    mockGetStats.mockResolvedValue(stats(0, 400))
    const { queryByText } = render(
      <ConnectionStatus endpoint="https://tracks.example.org" navigation={mockNavigation} />
    )

    await waitFor(() => expect(queryByText(/queued/)).toBeNull())
  })

  it("paints no surface of its own, because the dock card it sits in is the surface", async () => {
    const { getByRole } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)

    const style = StyleSheet.flatten(getByRole("button").props.style)
    expect(style.backgroundColor).toBeUndefined()
    expect(style.borderRadius).toBeUndefined()
    expect(style.borderWidth).toBeUndefined()
    expect(style.marginBottom).toBeUndefined()
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
  })

  it("paints the state on the dot alone and prints the word in the secondary text colour, which clears 4.5 on the dock in dark mode where the hues do not", async () => {
    const { getByText, UNSAFE_getAllByType } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

    emit("onSyncError", { message: "send failed", queuedCount: 3 })
    await waitFor(() => expect(getByText("Unreachable")).toBeTruthy())

    const { View } = require("react-native")
    const dot = UNSAFE_getAllByType(View).find((v: any) => StyleSheet.flatten(v.props.style)?.width === 8)
    expect(StyleSheet.flatten(dot?.props.style).backgroundColor).toBe(lightColors.error)
    expect(StyleSheet.flatten(getByText("Unreachable").props.style).color).toBe(lightColors.textSecondary)
  })

  it("centres the dot in ListItem's icon column, so the host starts where the rows above it do", async () => {
    const { getByRole, UNSAFE_getAllByType } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)
    await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

    const { View } = require("react-native")
    const box = UNSAFE_getAllByType(View).find((v: any) => StyleSheet.flatten(v.props.style)?.width === size.icon.md)
    expect(StyleSheet.flatten(box?.props.style).alignItems).toBe("center")
    expect(StyleSheet.flatten(getByRole("button").props.style).gap).toBe(space.lg)
  })

  it("lets both the host and the status give way at a large font scale, so neither collapses to nothing", async () => {
    mockGetStats.mockResolvedValue(stats(12345, 5))

    const { getByText } = render(<ConnectionStatus endpoint={url} navigation={mockNavigation} />)
    await waitFor(() => expect(getByText(/queued/)).toBeTruthy())

    const host = StyleSheet.flatten(getByText("example.com").props.style)
    const status = StyleSheet.flatten(getByText(/queued/).props.style)
    expect(host.flexGrow).toBe(1)
    expect(host.flexShrink).toBe(1)
    expect(status.flexShrink).toBe(1)
  })

  it("reads host and status as one row to a screen reader, so the tap target names what it opens", async () => {
    mockGetStats.mockResolvedValue(stats(12, 400))
    const { getByRole } = render(<ConnectionStatus endpoint="https://tracks.example.org" navigation={mockNavigation} />)

    await waitFor(() =>
      expect(getByRole("button").props.accessibilityLabel).toBe("tracks.example.org, Checking · 12 queued")
    )
  })
})
