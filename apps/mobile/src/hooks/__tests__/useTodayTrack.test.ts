import { renderHook, act } from "@testing-library/react-native"

// Mock logger
jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn() }
}))

// Mock NativeLocationService
const mockGetLocationsByDateRange = jest.fn().mockResolvedValue([])

jest.mock("../../services/NativeLocationService", () => ({
  getLocationsByDateRange: (...args: any[]) => mockGetLocationsByDateRange(...args)
}))

import { useTodayTrack } from "../useTodayTrack"
import { logger } from "../../utils/logger"

let appStateCallback: ((state: string) => void) | null = null
const mockAppStateRemove = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  appStateCallback = null
  mockGetLocationsByDateRange.mockResolvedValue([])

  const { AppState } = require("react-native")
  ;(AppState.addEventListener as jest.Mock).mockImplementation((_: string, cb: (state: string) => void) => {
    appStateCallback = cb
    return { remove: mockAppStateRemove }
  })
})

afterEach(() => {
  jest.useRealTimers()
})

function makeCoords(ts: number, lat = 48.1, lon = 11.5) {
  return { latitude: lat, longitude: lon, timestamp: ts, accuracy: 10, speed: 2, altitude: 500 }
}

describe("useTodayTrack", () => {
  describe("initial state", () => {
    it("returns empty locations when not tracking", () => {
      const { result } = renderHook(() => useTodayTrack(false, null))
      expect(result.current.locations).toEqual([])
    })

    it("loads locations from DB when tracking starts", async () => {
      const dbRows = [
        { latitude: 48.1, longitude: 11.5, timestamp: 1000, accuracy: 10, speed: 2, altitude: 500 },
        { latitude: 48.2, longitude: 11.6, timestamp: 1010, accuracy: 10, speed: 3, altitude: 510 }
      ]
      mockGetLocationsByDateRange.mockResolvedValueOnce(dbRows)

      const { result } = renderHook(() => useTodayTrack(true, null))

      await act(async () => {})

      expect(mockGetLocationsByDateRange).toHaveBeenCalled()
      expect(result.current.locations).toHaveLength(2)
      expect(result.current.locations[0].latitude).toBe(48.1)
      expect(result.current.locations[1].latitude).toBe(48.2)
    })
  })

  describe("clearing on tracking stop", () => {
    it("clears locations when tracking becomes false", async () => {
      const dbRows = [{ latitude: 48.1, longitude: 11.5, timestamp: 1000, accuracy: 10, speed: 2, altitude: 500 }]
      mockGetLocationsByDateRange.mockResolvedValueOnce(dbRows)

      const { result, rerender } = renderHook(({ tracking }: { tracking: boolean }) => useTodayTrack(tracking, null), {
        initialProps: { tracking: true }
      })

      await act(async () => {})
      expect(result.current.locations).toHaveLength(1)

      rerender({ tracking: false })
      expect(result.current.locations).toEqual([])
    })
  })

  describe("appending coords", () => {
    it("appends new coords with newer timestamp", async () => {
      mockGetLocationsByDateRange.mockResolvedValueOnce([])

      // Start with no coords so DB load completes first
      const { result, rerender } = renderHook(
        ({ coords }: { coords: ReturnType<typeof makeCoords> | null }) => useTodayTrack(true, coords),
        { initialProps: { coords: null as ReturnType<typeof makeCoords> | null } }
      )

      await act(async () => {})

      rerender({ coords: makeCoords(2000) })
      expect(result.current.locations).toHaveLength(1)

      rerender({ coords: makeCoords(2010, 48.2, 11.6) })
      expect(result.current.locations).toHaveLength(2)
    })

    it("skips coords with duplicate timestamp", async () => {
      mockGetLocationsByDateRange.mockResolvedValueOnce([])

      const { result, rerender } = renderHook(
        ({ coords }: { coords: ReturnType<typeof makeCoords> | null }) => useTodayTrack(true, coords),
        { initialProps: { coords: null as ReturnType<typeof makeCoords> | null } }
      )

      await act(async () => {})

      rerender({ coords: makeCoords(2000) })
      expect(result.current.locations).toHaveLength(1)

      // Same timestamp - should be skipped
      rerender({ coords: makeCoords(2000, 48.2, 11.6) })
      expect(result.current.locations).toHaveLength(1)
    })

    it("skips coords with no timestamp", async () => {
      mockGetLocationsByDateRange.mockResolvedValueOnce([])

      const coords = { latitude: 48.1, longitude: 11.5, timestamp: 0, accuracy: 10, speed: 2, altitude: 500 }
      const { result } = renderHook(() => useTodayTrack(true, coords))

      await act(async () => {})
      expect(result.current.locations).toHaveLength(0)
    })
  })

  describe("flush batching", () => {
    it("bumps version after flush interval when coords are appended", async () => {
      mockGetLocationsByDateRange.mockResolvedValueOnce([])

      const coords1 = makeCoords(3000)
      const { result, rerender } = renderHook(
        ({ coords }: { coords: ReturnType<typeof makeCoords> | null }) => useTodayTrack(true, coords),
        {
          initialProps: { coords: coords1 }
        }
      )

      await act(async () => {})
      const versionAfterLoad = result.current.version

      const coords2 = makeCoords(3010, 48.2, 11.6)
      rerender({ coords: coords2 })

      const versionBeforeFlush = result.current.version
      expect(versionBeforeFlush).toBe(versionAfterLoad)

      await act(async () => {
        jest.advanceTimersByTime(5000)
      })

      expect(result.current.version).toBeGreaterThan(versionBeforeFlush)
    })
  })

  describe("foreground catch-up", () => {
    it("does incremental load when app comes to foreground", async () => {
      const dbRows = [{ latitude: 48.1, longitude: 11.5, timestamp: 1000, accuracy: 10, speed: 2, altitude: 500 }]
      mockGetLocationsByDateRange.mockResolvedValueOnce(dbRows)

      renderHook(() => useTodayTrack(true, null))
      await act(async () => {})

      expect(mockGetLocationsByDateRange).toHaveBeenCalledTimes(1)

      const catchUpRows = [{ latitude: 48.3, longitude: 11.7, timestamp: 1020, accuracy: 10, speed: 4, altitude: 520 }]
      mockGetLocationsByDateRange.mockResolvedValueOnce(catchUpRows)

      await act(async () => {
        appStateCallback?.("active")
      })

      expect(mockGetLocationsByDateRange).toHaveBeenCalledTimes(2)
      // Second call should use lastTimestamp as the since param
      expect(mockGetLocationsByDateRange.mock.calls[1][0]).toBe(1000)
    })

    it("does full load when app comes to foreground with no prior data", async () => {
      mockGetLocationsByDateRange.mockResolvedValue([])

      renderHook(() => useTodayTrack(true, null))
      await act(async () => {})

      await act(async () => {
        appStateCallback?.("active")
      })

      const calls = mockGetLocationsByDateRange.mock.calls
      expect(calls).toHaveLength(2)
      // Both calls are full loads (startOfDayUnix) - much larger than a typical "since" value
      expect(calls[0][0]).toBeGreaterThan(1000000)
      expect(calls[1][0]).toBeGreaterThan(1000000)
    })

    it("does not subscribe to AppState when not tracking", async () => {
      renderHook(() => useTodayTrack(false, null))
      await act(async () => {})

      expect(appStateCallback).toBeNull()
    })
  })

  describe("error handling", () => {
    it("logs error when DB load fails", async () => {
      mockGetLocationsByDateRange.mockRejectedValueOnce(new Error("DB corrupt"))

      renderHook(() => useTodayTrack(true, null))
      await act(async () => {})

      expect(logger.error).toHaveBeenCalledWith("[useTodayTrack] Failed to load locations:", expect.any(Error))
    })

    it("still works after a failed load", async () => {
      mockGetLocationsByDateRange.mockRejectedValueOnce(new Error("DB corrupt"))

      const { result } = renderHook(() => useTodayTrack(true, makeCoords(5000)))
      await act(async () => {})

      expect(result.current.locations).toHaveLength(1)
      expect(result.current.locations[0].timestamp).toBe(5000)
    })
  })

  describe("cleanup", () => {
    it("clears flush timer on unmount", async () => {
      mockGetLocationsByDateRange.mockResolvedValueOnce([])

      const coords = makeCoords(6000)
      const { unmount, rerender } = renderHook(
        ({ c }: { c: ReturnType<typeof makeCoords> }) => useTodayTrack(true, c),
        {
          initialProps: { c: coords }
        }
      )

      await act(async () => {})

      rerender({ c: makeCoords(6010, 48.2, 11.6) })

      const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout")
      unmount()
      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    it("removes AppState listener on unmount", async () => {
      mockGetLocationsByDateRange.mockResolvedValueOnce([])

      const { unmount } = renderHook(() => useTodayTrack(true, null))
      await act(async () => {})

      unmount()
      expect(mockAppStateRemove).toHaveBeenCalled()
    })
  })
})
