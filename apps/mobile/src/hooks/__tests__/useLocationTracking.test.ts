import { renderHook, act } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"
import { showAlert } from "../../services/modalService"

jest.mock("../../services/modalService", () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn()
}))

// Mock NativeLocationService
const mockStart = jest.fn().mockResolvedValue(undefined)
const mockStop = jest.fn()
const mockGetMostRecentLocation = jest.fn().mockResolvedValue(null)
const mockIsTrackingActive = jest.fn().mockResolvedValue(false)
const mockIsServiceRunning = jest.fn().mockResolvedValue(true)

jest.mock("../../services/NativeLocationService", () => ({
  start: (...args: any[]) => mockStart(...args),
  stop: (...args: any[]) => mockStop(...args),
  getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args),
  isTrackingActive: (...args: any[]) => mockIsTrackingActive(...args),
  isServiceRunning: (...args: any[]) => mockIsServiceRunning(...args)
}))

// Mock permissions
const mockEnsurePermissions = jest.fn().mockResolvedValue(true)
const mockCheckPermissions = jest.fn().mockResolvedValue({ location: true, background: true, notifications: true })
jest.mock("../../services/LocationServicePermission", () => ({
  ensurePermissions: (...args: any[]) => mockEnsurePermissions(...args),
  checkPermissions: (...args: any[]) => mockCheckPermissions(...args)
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
  // clearAllMocks keeps implementations, so restore the defaults each test explicitly overrides
  mockIsTrackingActive.mockResolvedValue(false)
  mockIsServiceRunning.mockResolvedValue(true)
  mockCheckPermissions.mockResolvedValue({ location: true, background: true, notifications: true })
  jest.spyOn(console, "log").mockImplementation()
  jest.spyOn(console, "error").mockImplementation()
  jest.spyOn(console, "warn").mockImplementation()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("useLocationTracking", () => {
  describe("initial state", () => {
    it("returns default state", () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      expect(result.current.coords).toBeNull()
      expect(result.current.tracking).toBe(false)
      expect(result.current.settings).toBe(DEFAULT_SETTINGS)
    })
  })

  describe("startTracking", () => {
    it("requests permissions and starts native service", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(mockEnsurePermissions).toHaveBeenCalled()
      expect(mockStart).toHaveBeenCalledWith(DEFAULT_SETTINGS)
      expect(result.current.tracking).toBe(true)
    })

    it("does not start if already tracking", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

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
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(showAlert).toHaveBeenCalledWith("Permission Required", expect.any(String), "warning")
      expect(mockStart).not.toHaveBeenCalled()
      expect(result.current.tracking).toBe(false)
    })

    it("reverts tracking state if native start fails", async () => {
      mockStart.mockRejectedValueOnce(new Error("native error"))
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      expect(result.current.tracking).toBe(false)
      expect(showAlert).toHaveBeenCalledWith("Error", expect.any(String), "error")
    })
  })

  describe("stopTracking", () => {
    it("stops native service and clears state", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

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
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      act(() => {
        result.current.stopTracking()
      })

      expect(mockStop).not.toHaveBeenCalled()
    })
  })

  describe("restartTracking", () => {
    it("stops the service and clears coords during restart", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

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
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

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
    it("sets tracking to true and fetches last known location", async () => {
      mockGetMostRecentLocation.mockResolvedValueOnce({
        latitude: 48.1,
        longitude: 11.5,
        accuracy: 10,
        altitude: 500,
        speed: 0,
        bearing: 0,
        timestamp: 1700000000,
        battery: 90,
        batteryStatus: 2
      })

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.reconnect()
      })

      expect(result.current.tracking).toBe(true)
      expect(result.current.coords).toEqual({
        latitude: 48.1,
        longitude: 11.5,
        accuracy: 10,
        altitude: 500,
        speed: 0,
        bearing: 0,
        timestamp: 1700000000,
        battery: 90,
        battery_status: 2
      })
      expect(mockEnsurePermissions).not.toHaveBeenCalled()
      expect(mockStart).not.toHaveBeenCalled()
    })

    it("sets tracking to true even if no stored location", async () => {
      mockGetMostRecentLocation.mockResolvedValueOnce(null)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.reconnect()
      })

      expect(result.current.tracking).toBe(true)
      expect(result.current.coords).toBeNull()
    })

    it("does nothing if already tracking", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      await act(async () => {
        await result.current.reconnect()
      })

      expect(result.current.tracking).toBe(true)
    })

    // Hydration reads settings from SQLite and reconnects in the same pass, before the hook's
    // settings ref has caught up - restarting on the ref would configure the service from defaults.
    it("restarts a dead service with the settings it was handed, not the stale ref", async () => {
      mockIsServiceRunning.mockResolvedValue(false)
      const stored = { ...DEFAULT_SETTINGS, interval: 42 }

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.reconnect(stored)
      })

      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ interval: 42 }))
    })
  })

  describe("AppState foreground sync", () => {
    let appStateCallback: (state: string) => void

    beforeEach(() => {
      const { AppState } = require("react-native")
      ;(AppState.addEventListener as jest.Mock).mockImplementation((_event: string, cb: (state: string) => void) => {
        appStateCallback = cb
        return { remove: jest.fn() }
      })
    })

    it("reconnects when service was started externally while app was backgrounded", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockGetMostRecentLocation.mockResolvedValue(null)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      // App is not tracking in UI, but service is active
      await act(async () => {
        await appStateCallback("active")
      })

      expect(mockIsTrackingActive).toHaveBeenCalled()
      expect(result.current.tracking).toBe(true)
    })

    it("updates UI to stopped when service was stopped externally", async () => {
      mockIsTrackingActive.mockResolvedValue(false)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      // Start tracking in UI first
      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })
      expect(result.current.tracking).toBe(true)

      // Service was stopped externally
      await act(async () => {
        await appStateCallback("active")
      })

      expect(result.current.tracking).toBe(false)
    })

    it("refreshes coords when already in sync on foreground", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockGetMostRecentLocation.mockResolvedValue({
        latitude: 48.1,
        longitude: 11.5,
        accuracy: 10,
        altitude: 500,
        speed: 0,
        bearing: 0,
        timestamp: 1700000000,
        battery: 80,
        batteryStatus: 2
      })

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      await act(async () => {
        await appStateCallback("active")
      })

      expect(result.current.coords?.latitude).toBe(48.1)
    })

    /**
     * The #444 case: the user still wants tracking and the UI still shows it, but Android killed
     * the service. Nothing recorded until the user noticed and toggled Stop/Start by hand.
     */
    it("restarts the service when tracking is on but the service died", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockIsServiceRunning.mockResolvedValue(true)
      mockGetMostRecentLocation.mockResolvedValue(null)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })
      expect(mockStart).toHaveBeenCalledTimes(1)

      mockIsServiceRunning.mockResolvedValue(false)
      await act(async () => {
        await appStateCallback("active")
      })

      expect(mockStart).toHaveBeenCalledTimes(2)
      // A resume must never replay the disclosure or the battery/notification dialogs
      expect(mockEnsurePermissions).toHaveBeenCalledTimes(1)
      expect(result.current.tracking).toBe(true)
    })

    it("reconnects and restarts when the service died while the app was closed", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockIsServiceRunning.mockResolvedValue(false)
      mockGetMostRecentLocation.mockResolvedValue(null)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await appStateCallback("active")
      })

      expect(mockStart).toHaveBeenCalledTimes(1)
      expect(mockEnsurePermissions).not.toHaveBeenCalled()
      expect(result.current.tracking).toBe(true)
    })

    /**
     * TrackingProvider mounts with DEFAULT_SETTINGS and replaces them from SQLite a round trip later.
     * A listener registered before that read lands revives a dead service with no endpoint, so uploads
     * stop and the rows queued meanwhile keep the default field map.
     */
    it("does not subscribe to AppState before settings are hydrated", async () => {
      const { AppState } = require("react-native")
      mockIsTrackingActive.mockResolvedValue(true)
      mockIsServiceRunning.mockResolvedValue(false)
      mockGetMostRecentLocation.mockResolvedValue(null)

      const persisted = { ...DEFAULT_SETTINGS, endpoint: "https://example.test/loc", interval: 6 }

      const { rerender } = renderHook(
        ({ current, hydrated }: { current: Settings; hydrated: boolean }) => useLocationTracking(current, hydrated),
        { initialProps: { current: DEFAULT_SETTINGS, hydrated: false } }
      )

      expect(AppState.addEventListener).not.toHaveBeenCalled()

      rerender({ current: persisted, hydrated: true })
      expect(AppState.addEventListener).toHaveBeenCalledTimes(1)

      await act(async () => {
        await appStateCallback("active")
      })

      expect(mockStart).toHaveBeenCalledTimes(1)
      expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "https://example.test/loc" }))
    })

    it("leaves a live service alone", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockIsServiceRunning.mockResolvedValue(true)
      mockGetMostRecentLocation.mockResolvedValue(null)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      await act(async () => {
        await appStateCallback("active")
      })

      expect(mockStart).toHaveBeenCalledTimes(1)
      expect(result.current.tracking).toBe(true)
    })

    // A bridge failure says nothing about the service - restarting on it would double-start.
    /**
     * Hydration and the foreground handler both reconcile on app open. Without a guard both
     * observe the service still down while the first start is in flight, and the service gets
     * a second onStartCommand it never needed. Caught on a device, not by the single-path tests.
     */
    it("starts a dead service only once when both reconcile paths fire together", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockIsServiceRunning.mockResolvedValue(false)
      mockGetMostRecentLocation.mockResolvedValue(null)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await Promise.all([result.current.reconnect(DEFAULT_SETTINGS), appStateCallback("active")])
      })

      expect(mockStart).toHaveBeenCalledTimes(1)
    })

    it("does not restart when liveness is unknown", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockIsServiceRunning.mockResolvedValue(null)
      mockGetMostRecentLocation.mockResolvedValue(null)

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await result.current.startTracking(DEFAULT_SETTINGS)
      })

      await act(async () => {
        await appStateCallback("active")
      })

      expect(mockStart).toHaveBeenCalledTimes(1)
    })

    it("does not restart a dead service when location permission is gone", async () => {
      mockIsTrackingActive.mockResolvedValue(true)
      mockIsServiceRunning.mockResolvedValue(false)
      mockCheckPermissions.mockResolvedValue({ location: false, background: false, notifications: true })
      mockGetMostRecentLocation.mockResolvedValue(null)

      renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await appStateCallback("active")
      })

      expect(mockStart).not.toHaveBeenCalled()
    })

    it("does nothing when transitioning to background", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

      await act(async () => {
        await appStateCallback("background")
      })

      expect(mockIsTrackingActive).not.toHaveBeenCalled()
      expect(result.current.tracking).toBe(false)
    })
  })

  describe("native event listener", () => {
    it("attaches listener when tracking starts", async () => {
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

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

      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

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
      const { result } = renderHook(() => useLocationTracking(DEFAULT_SETTINGS, true))

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
