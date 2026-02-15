import React from "react"
import { render, waitFor } from "@testing-library/react-native"

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
      border: "#e5e7eb"
    }
  })
}))

const mockSettings = {
  isOfflineMode: false
}
jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

const mockIsNetworkAvailable = jest.fn().mockResolvedValue(true)
const mockGetAuthHeaders = jest.fn().mockResolvedValue({})
jest.mock("../../../../services/NativeLocationService", () => ({
  isNetworkAvailable: (...args: any[]) => mockIsNetworkAvailable(...args),
  getAuthHeaders: (...args: any[]) => mockGetAuthHeaders(...args)
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

const mockFetch = jest.fn()
global.fetch = mockFetch as any

import { ServerConnection } from "../ServerConnection"

const mockNavigation = { navigate: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockSettings.isOfflineMode = false
  mockIsNetworkAvailable.mockResolvedValue(true)
  mockGetAuthHeaders.mockResolvedValue({})
})

afterEach(() => {
  jest.useRealTimers()
})

describe("ServerConnection", () => {
  it("shows 'Checking' initially before server check completes", () => {
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    expect(getByText("Checking")).toBeTruthy()
  })

  it("shows 'Connected' when server responds OK", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    await waitFor(() => {
      expect(getByText("Connected")).toBeTruthy()
    })
  })

  it("shows 'Unreachable' when fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"))

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    await waitFor(() => {
      expect(getByText("Unreachable")).toBeTruthy()
    })
  })

  it("shows 'No endpoint' when endpoint is empty", async () => {
    const { getByText } = render(<ServerConnection endpoint="" navigation={mockNavigation} />)

    await waitFor(() => {
      expect(getByText("No endpoint")).toBeTruthy()
    })
  })

  it("shows 'No endpoint' when endpoint is null", async () => {
    const { getByText } = render(<ServerConnection endpoint={null} navigation={mockNavigation} />)

    await waitFor(() => {
      expect(getByText("No endpoint")).toBeTruthy()
    })
  })

  it("shows 'Offline' when offline mode is enabled", async () => {
    mockSettings.isOfflineMode = true

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    await waitFor(() => {
      expect(getByText("Offline")).toBeTruthy()
    })
  })

  it("shows 'Device offline' when network is unavailable", async () => {
    mockIsNetworkAvailable.mockResolvedValue(false)

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    await waitFor(() => {
      expect(getByText("Device offline")).toBeTruthy()
    })
  })

  it("falls back to endpoint URL when /health returns 404", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 }) // /health
      .mockResolvedValueOnce({ ok: true, status: 200 }) // original endpoint

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    await waitFor(() => {
      expect(getByText("Connected")).toBeTruthy()
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("falls back to base URL when endpoint also fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 }) // /health
      .mockResolvedValueOnce({ ok: false, status: 500 }) // endpoint
      .mockResolvedValueOnce({ ok: true, status: 200 }) // base URL

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    await waitFor(() => {
      expect(getByText("Connected")).toBeTruthy()
    })

    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("displays the host portion of the endpoint URL", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const { getByText } = render(
      <ServerConnection endpoint="https://my-server.com/api/locations" navigation={mockNavigation} />
    )

    expect(getByText("my-server.com")).toBeTruthy()
  })

  it("displays 'Server' when endpoint is empty", () => {
    const { getByText } = render(<ServerConnection endpoint="" navigation={mockNavigation} />)

    expect(getByText("Server")).toBeTruthy()
  })

  it("includes auth headers in health check", async () => {
    mockGetAuthHeaders.mockResolvedValue({ Authorization: "Bearer token123" })
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    render(<ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { Authorization: "Bearer token123" }
        })
      )
    })
  })

  it("proceeds without auth headers if getAuthHeaders fails", async () => {
    mockGetAuthHeaders.mockRejectedValue(new Error("no credentials"))
    mockFetch.mockResolvedValue({ ok: true, status: 200 })

    const { getByText } = render(
      <ServerConnection endpoint="https://example.com/api/locations" navigation={mockNavigation} />
    )

    await waitFor(() => {
      expect(getByText("Connected")).toBeTruthy()
    })
  })
})
