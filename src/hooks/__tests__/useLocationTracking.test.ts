import { renderHook, act } from "@testing-library/react-native"
import { Alert } from "react-native"
import { DEFAULT_SETTINGS } from "../../types/global"

// Mock NativeLocationService
const mockStart = jest.fn().mockResolvedValue(undefined)
const mockStop = jest.fn()
const mockGetMostRecentLocation = jest.fn().mockResolvedValue(null)

jest.mock("../../services/NativeLocationService", () => ({
  start: (...args: any[]) => mockStart(...args),
  stop: (...args: any[]) => mockStop(...args),
  getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args)
}))

// Mock permissions
const mockEnsurePermissions = jest.fn().mockResolvedValue(true)
jest.mock("../../services/LocationServicePermission", () => ({
  ensurePermissions: (...args: any[]) => mockEnsurePermissions(...args)
}))

// Mock NativeEventEmitter as a class
const mockRemove = jest.fn()
const mockAddListener = jest.fn().mockReturnValue({ remove: mockRemove })

jest.mock("react-native/Libraries/EventEmitter/NativeEventEmitter", () => {
  return {
    __esModule: true,
    default: function () {
      return { addListener: (...args: any[]) => mockAddListener(...args) }
    }
  }
})

import { useLocationTracking } from "../useLocationTracking"

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Alert, "alert").mockImplementation()
  jest.spyOn(console, "log").mockImplementation()
  jest.spyOn(console, "error").mockImplementation()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("useLocationTracking", () => {
  describe("initial state", () => {
    it("returns default state", () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      expect(result.current.coords).toBeNull()
      expect(result.current.tracking).toBe(false)
      expect(result.current.settings).toBe(DEFAULT_SETTINGS)
    })
  })

  describe("startTracking", () => {
    it("requests permissions and starts native service", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(mockEnsurePermissions).toHaveBeenCalled()
      expect(mockStart).toHaveBeenCalledWith(DEFAULT_SETTINGS)
      expect(result.current.tracking).toBe(true)
    })

    it("does not start if already tracking", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(mockStart).toHaveBeenCalledTimes(1)
    })

    it("shows alert and does not start if permissions denied", async () => {
      mockEnsurePermissions.mockResolvedValueOnce(false)
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(Alert.alert).toHaveBeenCalledWith("Permission Required", expect.any(String))
      expect(mockStart).not.toHaveBeenCalled()
      expect(result.current.tracking).toBe(false)
    })

    it("reverts tracking state if native start fails", async () => {
      mockStart.mockRejectedValueOnce(new Error("native error"))
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(result.current.tracking).toBe(false)
      expect(Alert.alert).toHaveBeenCalledWith("Error", expect.any(String))
    })
  })

  describe("stopTracking", () => {
    it("stops native service and clears state", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      act(() => {
        result.current.stopTracking()
      })

      expect(mockStop).toHaveBeenCalled()
      expect(result.current.tracking).toBe(false)
      expect(result.current.coords).toBeNull()
    })

    it("does nothing if not tracking", () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      act(() => {
        result.current.stopTracking()
      })

      expect(mockStop).not.toHaveBeenCalled()
    })
  })

  describe("restartTracking", () => {
    it("stops the service and clears coords during restart", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(result.current.tracking).toBe(true)

      await act(async () => {
        await result.current.restartTracking({ ...DEFAULT_SETTINGS, interval: 30 })
      })

      expect(mockStop).toHaveBeenCalled()
    })

    it("queues restart if already restarting", async () => {
      const logSpy = jest.spyOn(console, "log").mockImplementation()
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      // Start two restarts simultaneously
      act(() => {
        result.current.restartTracking()
        result.current.restartTracking() // should queue
      })

      const queuedCalls = logSpy.mock.calls.filter((c: any[]) => typeof c[0] === "string" && c[0].includes("queuing"))
      expect(queuedCalls.length).toBeGreaterThan(0)
    })
  })

  describe("reconnect", () => {
    it("sets tracking to true without requesting permissions or starting service", () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      act(() => {
        result.current.reconnect()
      })

      expect(result.current.tracking).toBe(true)
      expect(mockEnsurePermissions).not.toHaveBeenCalled()
      expect(mockStart).not.toHaveBeenCalled()
    })

    it("does nothing if already tracking", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      act(() => {
        result.current.reconnect()
      })

      expect(result.current.tracking).toBe(true)
    })
  })

  describe("native event listener", () => {
    it("attaches listener when tracking starts", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(mockAddListener).toHaveBeenCalledWith("onLocationUpdate", expect.any(Function))
    })

    it("updates coords when location event fires", async () => {
      let eventCallback: (event: any) => void
      mockAddListener.mockImplementation((_event: string, cb: (event: any) => void) => {
        eventCallback = cb
        return { remove: mockRemove }
      })

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      act(() => {
        eventCallback!({
          latitude: 48.123,
          longitude: 11.456,
          accuracy: 5,
          altitude: 500,
          speed: 1.2,
          bearing: 90,
          timestamp: 1700000000,
          battery: 85,
          batteryStatus: 2
        })
      })

      expect(result.current.coords).toEqual({
        latitude: 48.123,
        longitude: 11.456,
        accuracy: 5,
        altitude: 500,
        speed: 1.2,
        bearing: 90,
        timestamp: 1700000000,
        battery: 85,
        battery_status: 2
      })
    })

    it("removes listener when tracking stops", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      act(() => {
        result.current.stopTracking()
      })

      expect(mockRemove).toHaveBeenCalled()
    })
  })
})
