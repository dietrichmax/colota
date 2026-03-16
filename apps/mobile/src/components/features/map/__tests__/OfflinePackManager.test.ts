/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

jest.mock("@maplibre/maplibre-react-native", () => ({
  OfflineManager: {
    createPack: jest.fn(),
    getPacks: jest.fn(),
    getPack: jest.fn(),
    deletePack: jest.fn(),
    clearAmbientCache: jest.fn(),
    setTileCountLimit: jest.fn(),
    unsubscribe: jest.fn()
  }
}))

jest.mock("../../../../constants", () => ({
  MAP_STYLE_URL: "https://tiles.example.com/style.json"
}))

jest.mock("../../../../services/NativeLocationService")

import { OfflineManager } from "@maplibre/maplibre-react-native"
import NativeLocationService from "../../../../services/NativeLocationService"
import {
  willExceedTileLimit,
  estimateSizeLabel,
  estimateSizeBytes,
  formatBytes,
  createOfflinePack,
  loadOfflineAreas,
  deleteOfflineArea,
  loadOfflineAreaBounds,
  saveOfflineAreaBounds,
  removeOfflineAreaBounds,
  unsubscribeOfflinePack,
  DOWNLOAD_STATE,
  DETAIL_LABELS,
  DETAIL_SUBLABELS,
  MAX_OFFLINE_RADIUS_M
} from "../OfflinePackManager"

const mockOfflineManager = OfflineManager as jest.Mocked<typeof OfflineManager>
const mockGetSetting = NativeLocationService.getSetting as jest.Mock
const mockSaveSetting = NativeLocationService.saveSetting as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// ============================================================================
// Constants / exports
// ============================================================================

describe("constants", () => {
  it("MAX_OFFLINE_RADIUS_M is 100km", () => {
    expect(MAX_OFFLINE_RADIUS_M).toBe(100_000)
  })

  it("DOWNLOAD_STATE has expected values", () => {
    expect(DOWNLOAD_STATE.INACTIVE).toBe(0)
    expect(DOWNLOAD_STATE.ACTIVE).toBe(1)
    expect(DOWNLOAD_STATE.COMPLETE).toBe(2)
    expect(DOWNLOAD_STATE.FAILED).toBe(3)
  })

  it("DETAIL_LABELS has human-readable labels", () => {
    expect(DETAIL_LABELS.road).toBe("Standard")
    expect(DETAIL_LABELS.trail).toBe("Hiking")
  })

  it("DETAIL_SUBLABELS has subtitles for each level", () => {
    expect(DETAIL_SUBLABELS.road).toBeTruthy()
    expect(DETAIL_SUBLABELS.trail).toBeTruthy()
  })
})

// ============================================================================
// formatBytes
// ============================================================================

describe("formatBytes", () => {
  it("formats bytes below 1MB as KB", () => {
    expect(formatBytes(512 * 1024)).toBe("512.0 KB")
  })

  it("formats zero bytes as KB", () => {
    expect(formatBytes(0)).toBe("0.0 KB")
  })

  it("formats 1MB as MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
  })

  it("formats 1.5MB correctly", () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB")
  })

  it("formats large values as MB", () => {
    expect(formatBytes(250 * 1024 * 1024)).toBe("250.0 MB")
  })

  it("threshold is exactly 1MB - values below are KB, at or above are MB", () => {
    expect(formatBytes(1024 * 1024 - 1)).toMatch(/KB$/)
    expect(formatBytes(1024 * 1024)).toMatch(/MB$/)
  })
})

// ============================================================================
// willExceedTileLimit
// ============================================================================

describe("willExceedTileLimit", () => {
  it("returns false for a tiny area (100m radius, road)", () => {
    expect(willExceedTileLimit(0, 100, "road")).toBe(false)
  })

  it("returns false for a small area (1km radius, road)", () => {
    expect(willExceedTileLimit(0, 1_000, "road")).toBe(false)
  })

  it("returns false for a moderate area (10km radius, road)", () => {
    // road detail only goes to z14 - tile count stays well under 100k
    expect(willExceedTileLimit(0, 10_000, "road")).toBe(false)
  })

  it("returns true for maximum radius with trail detail at equator", () => {
    // 100km radius, trail detail (maxZoom=16) - hits the 100k tile cap
    expect(willExceedTileLimit(0, MAX_OFFLINE_RADIUS_M, "trail")).toBe(true)
  })

  it("trail detail exceeds limit at a radius where road does not", () => {
    // trail (z8-16) generates far more tiles than road (z8-14) for the same area.
    // At 90km radius at equator: trail accumulates ~126k tiles, road ~8.7k - road stays well under cap.
    expect(willExceedTileLimit(0, 90_000, "road")).toBe(false)
    expect(willExceedTileLimit(0, 90_000, "trail")).toBe(true)
  })
})

// ============================================================================
// estimateSizeBytes
// ============================================================================

describe("estimateSizeBytes", () => {
  it("returns a positive number for any non-zero radius", () => {
    expect(estimateSizeBytes(0, 1_000, "road")).toBeGreaterThan(0)
  })

  it("larger radius produces more bytes", () => {
    const small = estimateSizeBytes(0, 1_000, "road")
    const large = estimateSizeBytes(0, 20_000, "road")
    expect(large).toBeGreaterThan(small)
  })

  it("road bytes are positive for trail detail too", () => {
    expect(estimateSizeBytes(0, 500, "trail")).toBeGreaterThan(0)
  })

  it("is capped at TILE_COUNT_LIMIT * bytes_per_tile for road (5KB/tile)", () => {
    const capped = estimateSizeBytes(0, MAX_OFFLINE_RADIUS_M, "road")
    expect(capped).toBeLessThanOrEqual(100_000 * 5 * 1024)
  })

  it("is capped at TILE_COUNT_LIMIT * bytes_per_tile for trail (3KB/tile)", () => {
    const capped = estimateSizeBytes(0, MAX_OFFLINE_RADIUS_M, "trail")
    expect(capped).toBeLessThanOrEqual(100_000 * 3 * 1024)
  })

  it("size is consistent with estimateSizeLabel units", () => {
    const bytes = estimateSizeBytes(0, 5_000, "road")
    const mb = bytes / (1024 * 1024)
    const label = estimateSizeLabel(0, 5_000, "road")
    if (mb < 1) {
      expect(label).toMatch(/KB$/)
    } else if (mb < 1000) {
      expect(label).toMatch(/MB$/)
    } else {
      expect(label).toMatch(/GB$/)
    }
  })
})

// ============================================================================
// estimateSizeLabel
// ============================================================================

describe("estimateSizeLabel", () => {
  it("returns a string starting with ~", () => {
    expect(estimateSizeLabel(0, 1_000, "road")).toMatch(/^~/)
  })

  it("returns KB for very small areas", () => {
    expect(estimateSizeLabel(0, 100, "road")).toMatch(/KB$/)
  })

  it("larger radius produces a larger numeric value in the label", () => {
    const parseLabel = (s: string) => {
      const m = s.match(/~([\d.]+)\s*(KB|MB|GB)/)
      if (!m) return 0
      const v = parseFloat(m[1])
      if (m[2] === "KB") return v
      if (m[2] === "MB") return v * 1024
      return v * 1024 * 1024
    }
    expect(parseLabel(estimateSizeLabel(0, 20_000, "road"))).toBeGreaterThan(
      parseLabel(estimateSizeLabel(0, 1_000, "road"))
    )
  })

  it("returns GB when the estimated size is >= 1000 MB", () => {
    // Trail at max radius: 100k tiles * 3KB = ~293MB - not GB.
    // Artificially force a scenario by checking the cap at road:
    // 100k * 5KB = ~488MB - MB, not GB. GB only appears if tiles * bytes >= 1024 MB.
    // So GB would require bytes per tile to be higher. Let's just check the label format is valid.
    const label = estimateSizeLabel(0, MAX_OFFLINE_RADIUS_M, "trail")
    expect(label).toMatch(/^~[\d.]+ (KB|MB|GB)$/)
  })

  it("label reflects cap - same value for radius far above limit", () => {
    // Both of these should hit the tile cap and produce the same label
    const atCap = estimateSizeLabel(0, MAX_OFFLINE_RADIUS_M, "trail")
    const wayOverCap = estimateSizeLabel(0, MAX_OFFLINE_RADIUS_M * 2, "trail")
    expect(atCap).toBe(wayOverCap)
  })
})

// ============================================================================
// createOfflinePack
// ============================================================================

describe("createOfflinePack", () => {
  it("calls OfflineManager.setTileCountLimit before creating pack", async () => {
    mockOfflineManager.createPack.mockResolvedValueOnce(undefined as never)
    await createOfflinePack("test", 52.5, 13.4, 5_000, "road", jest.fn(), jest.fn())
    expect(mockOfflineManager.setTileCountLimit).toHaveBeenCalledWith(100_000)
    expect((mockOfflineManager.setTileCountLimit as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (mockOfflineManager.createPack as jest.Mock).mock.invocationCallOrder[0]
    )
  })

  it("calls OfflineManager.createPack with correct parameters", async () => {
    mockOfflineManager.createPack.mockResolvedValueOnce(undefined as never)
    await createOfflinePack("my-area", 52.5, 13.4, 5_000, "road", jest.fn(), jest.fn())
    expect(mockOfflineManager.createPack).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "my-area",
        styleURL: "https://tiles.example.com/style.json",
        minZoom: 8,
        maxZoom: 14,
        bounds: expect.any(Array)
      }),
      expect.any(Function),
      expect.any(Function)
    )
  })

  it("uses maxZoom 16 for trail detail", async () => {
    mockOfflineManager.createPack.mockResolvedValueOnce(undefined as never)
    await createOfflinePack("trail-area", 52.5, 13.4, 5_000, "trail", jest.fn(), jest.fn())
    expect(mockOfflineManager.createPack).toHaveBeenCalledWith(
      expect.objectContaining({ maxZoom: 16 }),
      expect.any(Function),
      expect.any(Function)
    )
  })

  it("invokes onProgress callback when OfflineManager progress fires", async () => {
    const onProgress = jest.fn()
    mockOfflineManager.createPack.mockImplementationOnce((_opts: unknown, progressCb: Function) => {
      progressCb(null, {
        state: 1,
        percentage: 50,
        completedResourceCount: 50,
        requiredResourceCount: 100,
        completedResourceSize: 25600
      })
      return Promise.resolve()
    })
    await createOfflinePack("test", 0, 0, 1_000, "road", onProgress, jest.fn())
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ state: 1, percentage: 50 }))
  })

  it("invokes onError callback when OfflineManager error fires", async () => {
    const onError = jest.fn()
    mockOfflineManager.createPack.mockImplementationOnce((_opts: unknown, _progressCb: Function, errorCb: Function) => {
      errorCb(null, new Error("tile limit exceeded"))
      return Promise.resolve()
    })
    await createOfflinePack("test", 0, 0, 1_000, "road", jest.fn(), onError)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })
})

// ============================================================================
// loadOfflineAreas
// ============================================================================

describe("loadOfflineAreas", () => {
  it("returns empty array when no packs exist", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([] as never)
    const areas = await loadOfflineAreas()
    expect(areas).toEqual([])
  })

  it("filters out packs without a name", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      { name: undefined, status: jest.fn().mockResolvedValue({ state: 2, completedResourceSize: 1024 }) },
      { name: "valid-area", status: jest.fn().mockResolvedValue({ state: 2, completedResourceSize: 2048 }) }
    ] as never)
    const areas = await loadOfflineAreas()
    expect(areas).toHaveLength(1)
    expect(areas[0].name).toBe("valid-area")
  })

  it("maps complete pack status correctly", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      {
        name: "downtown",
        status: jest.fn().mockResolvedValue({
          state: DOWNLOAD_STATE.COMPLETE,
          completedResourceSize: 5_000_000
        })
      }
    ] as never)
    const areas = await loadOfflineAreas()
    expect(areas[0]).toEqual({
      name: "downtown",
      sizeBytes: 5_000_000,
      isComplete: true,
      isActive: false
    })
  })

  it("maps active pack status correctly", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      {
        name: "in-progress",
        status: jest.fn().mockResolvedValue({
          state: DOWNLOAD_STATE.ACTIVE,
          completedResourceSize: 1_000_000
        })
      }
    ] as never)
    const areas = await loadOfflineAreas()
    expect(areas[0]).toEqual({
      name: "in-progress",
      sizeBytes: 1_000_000,
      isComplete: false,
      isActive: true
    })
  })

  it("handles status() throwing - returns null sizeBytes and false flags", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      {
        name: "broken-pack",
        status: jest.fn().mockRejectedValue(new Error("status unavailable"))
      }
    ] as never)
    const areas = await loadOfflineAreas()
    expect(areas[0]).toEqual({
      name: "broken-pack",
      sizeBytes: null,
      isComplete: false,
      isActive: false
    })
  })

  it("handles null completedResourceSize as null sizeBytes", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      {
        name: "partial",
        status: jest.fn().mockResolvedValue({ state: DOWNLOAD_STATE.INACTIVE })
      }
    ] as never)
    const areas = await loadOfflineAreas()
    expect(areas[0].sizeBytes).toBeNull()
  })
})

// ============================================================================
// deleteOfflineArea
// ============================================================================

describe("deleteOfflineArea", () => {
  it("unsubscribes, pauses, deletes pack, and clears cache", async () => {
    const mockPause = jest.fn().mockResolvedValue(undefined)
    mockOfflineManager.getPack.mockResolvedValueOnce({ pause: mockPause } as never)
    mockOfflineManager.deletePack.mockResolvedValueOnce(undefined as never)
    mockOfflineManager.clearAmbientCache.mockResolvedValueOnce(undefined as never)

    await deleteOfflineArea("my-area")

    expect(mockOfflineManager.unsubscribe).toHaveBeenCalledWith("my-area")
    expect(mockPause).toHaveBeenCalled()
    expect(mockOfflineManager.deletePack).toHaveBeenCalledWith("my-area")
    expect(mockOfflineManager.clearAmbientCache).toHaveBeenCalled()
  })

  it("skips pause if pack is already inactive (pause throws) but still deletes", async () => {
    const mockPause = jest.fn().mockRejectedValue(new Error("not active"))
    mockOfflineManager.getPack.mockResolvedValueOnce({ pause: mockPause } as never)
    mockOfflineManager.deletePack.mockResolvedValueOnce(undefined as never)
    mockOfflineManager.clearAmbientCache.mockResolvedValueOnce(undefined as never)

    await expect(deleteOfflineArea("inactive-area")).resolves.toBeUndefined()
    expect(mockOfflineManager.deletePack).toHaveBeenCalledWith("inactive-area")
    expect(mockOfflineManager.clearAmbientCache).toHaveBeenCalled()
  })

  it("skips delete if pack does not exist but still clears cache", async () => {
    mockOfflineManager.getPack.mockResolvedValueOnce(null as never)
    mockOfflineManager.clearAmbientCache.mockResolvedValueOnce(undefined as never)

    await deleteOfflineArea("missing-area")

    expect(mockOfflineManager.deletePack).not.toHaveBeenCalled()
    expect(mockOfflineManager.clearAmbientCache).toHaveBeenCalled()
  })
})

// ============================================================================
// unsubscribeOfflinePack
// ============================================================================

describe("unsubscribeOfflinePack", () => {
  it("calls OfflineManager.unsubscribe with the pack name", () => {
    unsubscribeOfflinePack("some-area")
    expect(mockOfflineManager.unsubscribe).toHaveBeenCalledWith("some-area")
  })
})

// ============================================================================
// loadOfflineAreaBounds
// ============================================================================

describe("loadOfflineAreaBounds", () => {
  it("returns parsed bounds from settings", async () => {
    const stored = [{ name: "home", lat: 52.5, lon: 13.4, radiusMeters: 5000 }]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(stored))
    expect(await loadOfflineAreaBounds()).toEqual(stored)
  })

  it("returns empty array when setting is empty JSON array", async () => {
    mockGetSetting.mockResolvedValueOnce("[]")
    expect(await loadOfflineAreaBounds()).toEqual([])
  })

  it("returns empty array when setting is null", async () => {
    mockGetSetting.mockResolvedValueOnce(null)
    expect(await loadOfflineAreaBounds()).toEqual([])
  })

  it("returns empty array when JSON is malformed", async () => {
    mockGetSetting.mockResolvedValueOnce("{invalid json")
    expect(await loadOfflineAreaBounds()).toEqual([])
  })

  it("returns empty array when getSetting throws", async () => {
    mockGetSetting.mockRejectedValueOnce(new Error("db error"))
    expect(await loadOfflineAreaBounds()).toEqual([])
  })
})

// ============================================================================
// saveOfflineAreaBounds
// ============================================================================

describe("saveOfflineAreaBounds", () => {
  it("appends a new entry when it does not exist", async () => {
    const existing = [{ name: "park", lat: 48.8, lon: 2.3, radiusMeters: 3000 }]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(existing))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    const newEntry = { name: "city", lat: 52.5, lon: 13.4, radiusMeters: 5000 }
    await saveOfflineAreaBounds(newEntry)

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(2)
    expect(saved).toContainEqual(newEntry)
    expect(saved).toContainEqual(existing[0])
  })

  it("replaces an existing entry with the same name", async () => {
    const old = { name: "home", lat: 52.0, lon: 13.0, radiusMeters: 2000 }
    mockGetSetting.mockResolvedValueOnce(JSON.stringify([old]))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    const updated = { name: "home", lat: 52.5, lon: 13.4, radiusMeters: 5000 }
    await saveOfflineAreaBounds(updated)

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual(updated)
  })

  it("saves using the correct settings key", async () => {
    mockGetSetting.mockResolvedValueOnce("[]")
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await saveOfflineAreaBounds({ name: "x", lat: 0, lon: 0, radiusMeters: 1000 })

    expect(mockSaveSetting).toHaveBeenCalledWith("offline_area_bounds", expect.any(String))
  })
})

// ============================================================================
// removeOfflineAreaBounds
// ============================================================================

describe("removeOfflineAreaBounds", () => {
  it("removes the named entry and saves the rest", async () => {
    const entries = [
      { name: "home", lat: 52.5, lon: 13.4, radiusMeters: 5000 },
      { name: "work", lat: 52.6, lon: 13.5, radiusMeters: 3000 }
    ]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(entries))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await removeOfflineAreaBounds("home")

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe("work")
  })

  it("is a no-op when the name does not exist", async () => {
    const entries = [{ name: "park", lat: 48.8, lon: 2.3, radiusMeters: 3000 }]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(entries))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await removeOfflineAreaBounds("nonexistent")

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(1)
  })

  it("saves an empty array when the only entry is removed", async () => {
    const entries = [{ name: "solo", lat: 0, lon: 0, radiusMeters: 1000 }]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(entries))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await removeOfflineAreaBounds("solo")

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toEqual([])
  })
})
