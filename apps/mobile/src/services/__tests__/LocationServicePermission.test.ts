import { Platform, PermissionsAndroid, Alert } from "react-native"
import { ensurePermissions, checkPermissions, registerDisclosureCallback } from "../LocationServicePermission"

// Mock NativeLocationService
jest.mock("../NativeLocationService", () => ({
  isIgnoringBatteryOptimizations: jest.fn().mockResolvedValue(true),
  requestIgnoreBatteryOptimizations: jest.fn().mockResolvedValue(undefined)
}))

import NativeLocationService from "../NativeLocationService"

const mockIsIgnoring = NativeLocationService.isIgnoringBatteryOptimizations as jest.Mock
const mockRequestIgnore = NativeLocationService.requestIgnoreBatteryOptimizations as jest.Mock

let alertSpy: jest.SpyInstance
let requestSpy: jest.SpyInstance
let checkSpy: jest.SpyInstance

function setPlatform(os: string, version: number) {
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true })
  Object.defineProperty(Platform, "Version", { get: () => version, configurable: true })
}

const originalOS = Platform.OS
const originalVersion = Platform.Version

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, "error").mockImplementation()
  requestSpy = jest.spyOn(PermissionsAndroid, "request").mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED)
  // Default: permissions not granted (so disclosure + request flow runs)
  checkSpy = jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(false)
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation()
  // Register auto-agree disclosure for tests
  registerDisclosureCallback(() => Promise.resolve(true))
})

afterEach(() => {
  jest.restoreAllMocks()
  setPlatform(originalOS, originalVersion as number)
  // Reset disclosure callback
  registerDisclosureCallback(() => Promise.resolve(true))
})

describe("ensurePermissions", () => {
  it("returns true immediately on non-Android platforms", async () => {
    setPlatform("ios", 0)

    const result = await ensurePermissions()

    expect(result).toBe(true)
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it("skips disclosure and requests if all permissions already granted", async () => {
    setPlatform("android", 33)
    checkSpy.mockResolvedValue(true)

    const disclosureSpy = jest.fn().mockResolvedValue(true)
    registerDisclosureCallback(disclosureSpy)

    const result = await ensurePermissions()

    expect(result).toBe(true)
    expect(disclosureSpy).not.toHaveBeenCalled()
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it("shows disclosure before requesting permissions", async () => {
    setPlatform("android", 28)
    const disclosureSpy = jest.fn().mockResolvedValue(true)
    registerDisclosureCallback(disclosureSpy)

    await ensurePermissions()

    expect(disclosureSpy).toHaveBeenCalledTimes(1)
    expect(requestSpy).toHaveBeenCalled()
  })

  it("returns false if user denies disclosure", async () => {
    setPlatform("android", 28)
    registerDisclosureCallback(() => Promise.resolve(false))

    const result = await ensurePermissions()

    expect(result).toBe(false)
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it("requests fine location permission", async () => {
    setPlatform("android", 28)

    await ensurePermissions()

    expect(requestSpy).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
  })

  it("returns false if fine location denied", async () => {
    setPlatform("android", 28)
    requestSpy.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED)

    const result = await ensurePermissions()

    expect(result).toBe(false)
  })

  it("requests background location on Android 10+", async () => {
    setPlatform("android", 29)

    await ensurePermissions()

    expect(requestSpy).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)
  })

  it("skips background location on Android < 10", async () => {
    setPlatform("android", 28)

    await ensurePermissions()

    const permissions = requestSpy.mock.calls.map((c: any[]) => c[0])
    expect(permissions).not.toContain(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)
  })

  it("requests notification permission on Android 13+", async () => {
    setPlatform("android", 33)

    await ensurePermissions()

    expect(requestSpy).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
  })

  it("skips notification permission on Android < 13", async () => {
    setPlatform("android", 29)

    await ensurePermissions()

    const permissions = requestSpy.mock.calls.map((c: any[]) => c[0])
    expect(permissions).not.toContain(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
  })

  it("returns false if background location denied", async () => {
    setPlatform("android", 29)
    requestSpy
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED) // fine location
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED) // background

    const result = await ensurePermissions()

    expect(result).toBe(false)
  })

  it("still returns true if notification permission denied (non-blocking)", async () => {
    setPlatform("android", 33)
    requestSpy
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED) // fine location
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED) // background
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED) // notification

    const result = await ensurePermissions()

    expect(result).toBe(true)
  })

  it("requests battery optimization exemption", async () => {
    setPlatform("android", 33)
    // First call from checkPermissions (checkBatteryOptimization), second from requestBatteryOptimizationExemption
    mockIsIgnoring.mockResolvedValueOnce(false).mockResolvedValueOnce(false)

    await ensurePermissions()

    expect(mockRequestIgnore).toHaveBeenCalled()
  })

  it("skips battery request if already exempted", async () => {
    setPlatform("android", 28)
    mockIsIgnoring.mockResolvedValueOnce(true)

    await ensurePermissions()

    expect(mockRequestIgnore).not.toHaveBeenCalled()
  })

  it("still returns true if battery optimization request fails", async () => {
    setPlatform("android", 28)
    mockIsIgnoring.mockRejectedValueOnce(new Error("battery check failed"))

    const result = await ensurePermissions()

    expect(result).toBe(true)
  })

  it("returns false and shows alert on unexpected error", async () => {
    setPlatform("android", 28)
    checkSpy.mockRejectedValueOnce(new Error("unexpected"))

    const result = await ensurePermissions()

    expect(result).toBe(false)
    expect(alertSpy).toHaveBeenCalledWith("Permission Error", expect.any(String), expect.any(Array))
  })

  it("uses fallback Alert disclosure if no callback registered", async () => {
    setPlatform("android", 28)
    // Unregister callback to trigger fallback
    registerDisclosureCallback(undefined as any)

    // ensurePermissions will call fallbackDisclosure() which uses Alert.alert
    // Alert.alert is mocked so it won't block - we need to simulate the tap
    alertSpy.mockImplementation((_title: string, _msg: string, buttons: any[]) => {
      // Auto-tap "Agree"
      const agreeButton = buttons.find((b: any) => b.text === "Agree")
      if (agreeButton?.onPress) agreeButton.onPress()
    })

    const result = await ensurePermissions()

    expect(alertSpy).toHaveBeenCalledWith(
      "Location Data Collection",
      expect.stringContaining("location data"),
      expect.any(Array),
      expect.any(Object)
    )
    expect(result).toBe(true)
  })

  it("skips already-granted permissions", async () => {
    setPlatform("android", 33)
    // Fine location already granted, background and notifications not
    checkSpy.mockImplementation((permission: string) => {
      if (permission === PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) {
        return Promise.resolve(true)
      }
      return Promise.resolve(false)
    })

    await ensurePermissions()

    const permissions = requestSpy.mock.calls.map((c: any[]) => c[0])
    expect(permissions).not.toContain(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
    expect(permissions).toContain(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)
  })
})

describe("checkPermissions", () => {
  it("returns all true on non-Android platforms", async () => {
    setPlatform("ios", 0)

    const result = await checkPermissions()

    expect(result).toEqual({
      location: true,
      background: true,
      notifications: true,
      batteryOptimized: true
    })
  })

  it("checks all permissions in parallel on Android", async () => {
    setPlatform("android", 33)

    checkSpy.mockImplementation((permission: string) => {
      if (permission === PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
        return Promise.resolve(false)
      }
      return Promise.resolve(true)
    })
    mockIsIgnoring.mockResolvedValueOnce(true)

    const result = await checkPermissions()

    expect(result.location).toBe(true)
    expect(result.background).toBe(true)
    expect(result.notifications).toBe(false)
    expect(result.batteryOptimized).toBe(true)
  })

  it("returns true for background on Android < 10", async () => {
    setPlatform("android", 28)
    mockIsIgnoring.mockResolvedValueOnce(true)

    const result = await checkPermissions()

    expect(result.background).toBe(true)
  })

  it("returns true for notifications on Android < 13", async () => {
    setPlatform("android", 29)
    mockIsIgnoring.mockResolvedValueOnce(true)

    const result = await checkPermissions()

    expect(result.notifications).toBe(true)
  })

  it("returns false for battery if check throws", async () => {
    setPlatform("android", 28)
    mockIsIgnoring.mockRejectedValueOnce(new Error("failed"))

    const result = await checkPermissions()

    expect(result.batteryOptimized).toBe(false)
  })
})
