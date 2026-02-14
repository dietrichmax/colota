import { Platform, PermissionsAndroid, Alert } from "react-native"
import { ensurePermissions, checkPermissions } from "../LocationServicePermission"

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
  checkSpy = jest.spyOn(PermissionsAndroid, "check").mockResolvedValue(true)
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation()
})

afterEach(() => {
  jest.restoreAllMocks()
  setPlatform(originalOS, originalVersion as number)
})

describe("ensurePermissions", () => {
  it("returns true immediately on non-Android platforms", async () => {
    setPlatform("ios", 0)

    const result = await ensurePermissions()

    expect(result).toBe(true)
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it("requests fine location permission", async () => {
    setPlatform("android", 28)

    await ensurePermissions()

    expect(requestSpy).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, expect.any(Object))
  })

  it("returns false if fine location denied", async () => {
    setPlatform("android", 28)
    requestSpy.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED)

    const result = await ensurePermissions()

    expect(result).toBe(false)
    expect(alertSpy).toHaveBeenCalledWith("Permission Required", expect.any(String), expect.any(Array))
  })

  it("requests background location on Android 10+", async () => {
    setPlatform("android", 29)

    await ensurePermissions()

    expect(requestSpy).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      expect.any(Object)
    )
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

    expect(requestSpy).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, expect.any(Object))
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

  it("returns false if notification permission denied", async () => {
    setPlatform("android", 33)
    requestSpy
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED) // fine location
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED) // background
      .mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED) // notification

    const result = await ensurePermissions()

    expect(result).toBe(false)
  })

  it("requests battery optimization exemption", async () => {
    setPlatform("android", 33)
    mockIsIgnoring.mockResolvedValueOnce(false)

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
    requestSpy.mockRejectedValueOnce(new Error("unexpected"))

    const result = await ensurePermissions()

    expect(result).toBe(false)
    expect(alertSpy).toHaveBeenCalledWith("Permission Error", expect.any(String), expect.any(Array))
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
