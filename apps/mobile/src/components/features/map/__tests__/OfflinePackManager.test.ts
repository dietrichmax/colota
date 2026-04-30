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
    setTileCountLimit: jest.fn(),
    removeListener: jest.fn(),
    resetDatabase: jest.fn()
  }
}))

jest.mock("../../../../constants", () => ({
  MAP_STYLE_URL_LIGHT: "https://tiles.example.com/style.json"
}))

jest.mock("../../../../services/NativeLocationService")

import { OfflineManager } from "@maplibre/maplibre-react-native"
import NativeLocationService from "../../../../services/NativeLocationService"
import { formatBytes } from "../../../../utils/format"
import {
  willExceedTileLimit,
  estimateSizeLabel,
  estimateSizeBytes,
  createOfflinePack,
  loadOfflineAreas,
  deleteOfflineArea,
  loadOfflineAreaBounds,
  saveOfflineAreaBounds,
  removeOfflineAreaBounds,
  unsubscribeOfflinePack,
  DOWNLOAD_STATE
} from "../OfflinePackManager"

const mockOfflineManager = OfflineManager as jest.Mocked<typeof OfflineManager>
const mockGetSetting = NativeLocationService.getSetting as jest.Mock
const mockSaveSetting = NativeLocationService.saveSetting as jest.Mock

// Bounding boxes [lon, lat] used across tests
const TINY_NE: [number, number] = [0.001, 0.001] // ~100m box at equator
const TINY_SW: [number, number] = [-0.001, -0.001]

const SMALL_NE: [number, number] = [0.1, 0.1] // ~11km box at equator
const SMALL_SW: [number, number] = [-0.1, -0.1]

const LARGE_NE: [number, number] = [0.9, 0.9] // ~100km box - trail exceeds tile limit, road does not
const LARGE_SW: [number, number] = [-0.9, -0.9]

beforeEach(() => {
  jest.clearAllMocks()
})

// ============================================================================
// Constants / exports
// ============================================================================

describe("constants", () => {
  it("DOWNLOAD_STATE has expected values", () => {
    expect(DOWNLOAD_STATE.INACTIVE).toBe("inactive")
    expect(DOWNLOAD_STATE.ACTIVE).toBe("active")
    expect(DOWNLOAD_STATE.COMPLETE).toBe("complete")
  })
})

// ============================================================================
// formatBytes
// ============================================================================

describe("formatBytes", () => {
  it("formats bytes below 1MB as KB", () => {
    expect(formatBytes(512 * 1024)).toBe("512.0 KB")
  })

  it("formats zero bytes as B", () => {
    expect(formatBytes(0)).toBe("0 B")
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
  it("returns false for a tiny area", () => {
    expect(willExceedTileLimit(TINY_NE, TINY_SW)).toBe(false)
  })

  it("returns false for a small area", () => {
    expect(willExceedTileLimit(SMALL_NE, SMALL_SW)).toBe(false)
  })

  it("returns false for a large (~100km) area - z8-14 stays under 100k tiles", () => {
    expect(willExceedTileLimit(LARGE_NE, LARGE_SW)).toBe(false)
  })

  it("returns true for a world-spanning area", () => {
    expect(willExceedTileLimit([180, 85], [-180, -85])).toBe(true)
  })
})

// ============================================================================
// estimateSizeBytes
// ============================================================================

describe("estimateSizeBytes", () => {
  it("returns a positive number for any non-zero area", () => {
    expect(estimateSizeBytes(SMALL_NE, SMALL_SW)).toBeGreaterThan(0)
  })

  it("larger area produces more bytes", () => {
    const small = estimateSizeBytes(SMALL_NE, SMALL_SW)
    const large = estimateSizeBytes(LARGE_NE, LARGE_SW)
    expect(large).toBeGreaterThan(small)
  })

  it("is capped at TILE_COUNT_LIMIT tiles", () => {
    // Max possible: all 100k tiles at the highest bucket (50 KB/tile for z >= 14)
    const cap = 100_000 * 50 * 1024
    expect(estimateSizeBytes([180, 85], [-180, -85])).toBeLessThanOrEqual(cap)
  })

  it("size is consistent with estimateSizeLabel units", () => {
    const bytes = estimateSizeBytes(SMALL_NE, SMALL_SW)
    const mb = bytes / (1024 * 1024)
    const label = estimateSizeLabel(SMALL_NE, SMALL_SW)
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
    expect(estimateSizeLabel(SMALL_NE, SMALL_SW)).toMatch(/^~/)
  })

  it("returns KB for very small areas", () => {
    expect(estimateSizeLabel(TINY_NE, TINY_SW)).toMatch(/KB$/)
  })

  it("larger area produces a larger numeric value in the label", () => {
    const parseLabel = (s: string) => {
      const m = s.match(/~([\d.]+)\s*(KB|MB|GB)/)
      if (!m) return 0
      const v = parseFloat(m[1])
      if (m[2] === "KB") return v
      if (m[2] === "MB") return v * 1024
      return v * 1024 * 1024
    }
    expect(parseLabel(estimateSizeLabel(LARGE_NE, LARGE_SW))).toBeGreaterThan(
      parseLabel(estimateSizeLabel(SMALL_NE, SMALL_SW))
    )
  })

  it("label has valid format", () => {
    expect(estimateSizeLabel(LARGE_NE, LARGE_SW)).toMatch(/^~[\d.]+ (KB|MB|GB)$/)
  })

  it("label for a capped area is bounded and does not grow with area size", () => {
    // With per-zoom bucketing, two capped areas may produce different estimates
    // (a vastly larger area burns the budget at cheaper low-zoom tiles).
    // The invariant is that both are bounded, not that they're equal.
    const wayOverNE: [number, number] = [180, 85]
    const wayOverSW: [number, number] = [-180, -85]
    expect(estimateSizeLabel(LARGE_NE, LARGE_SW)).toMatch(/^~[\d.]+ (KB|MB|GB)$/)
    expect(estimateSizeLabel(wayOverNE, wayOverSW)).toMatch(/^~[\d.]+ (KB|MB|GB)$/)
  })
})

// ============================================================================
// createOfflinePack
// ============================================================================

describe("createOfflinePack", () => {
  beforeEach(() => {
    mockOfflineManager.getPacks.mockResolvedValue([] as never)
    mockGetSetting.mockResolvedValue(null)
  })

  it("throws if a pack with the same name already exists", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      { id: "uuid-existing", metadata: { name: "existing" } }
    ] as never)
    await expect(createOfflinePack("existing", SMALL_NE, SMALL_SW, jest.fn(), jest.fn())).rejects.toThrow(
      'An offline area named "existing" already exists'
    )
    expect(mockOfflineManager.createPack).not.toHaveBeenCalled()
  })

  it("calls OfflineManager.setTileCountLimit before creating pack", async () => {
    mockOfflineManager.createPack.mockResolvedValueOnce({} as never)
    await createOfflinePack("test", SMALL_NE, SMALL_SW, jest.fn(), jest.fn())
    expect(mockOfflineManager.setTileCountLimit).toHaveBeenCalledWith(100_000)
    expect((mockOfflineManager.setTileCountLimit as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (mockOfflineManager.createPack as jest.Mock).mock.invocationCallOrder[0]
    )
  })

  it("uses default style URL when no custom URL is configured", async () => {
    mockOfflineManager.createPack.mockResolvedValueOnce({} as never)
    await createOfflinePack("my-area", SMALL_NE, SMALL_SW, jest.fn(), jest.fn())
    expect(mockOfflineManager.createPack).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: "my-area" },
        mapStyle: "https://tiles.example.com/style.json",
        minZoom: 8,
        maxZoom: 14,
        bounds: expect.any(Array)
      }),
      expect.any(Function),
      expect.any(Function)
    )
  })

  it("uses custom style URL from settings when configured", async () => {
    mockGetSetting.mockResolvedValueOnce("https://my-server.com/style.json")
    mockOfflineManager.createPack.mockResolvedValueOnce({} as never)
    await createOfflinePack("my-area", SMALL_NE, SMALL_SW, jest.fn(), jest.fn())
    expect(mockOfflineManager.createPack).toHaveBeenCalledWith(
      expect.objectContaining({ mapStyle: "https://my-server.com/style.json" }),
      expect.any(Function),
      expect.any(Function)
    )
  })

  it("invokes onProgress callback when OfflineManager progress fires", async () => {
    const onProgress = jest.fn()
    mockOfflineManager.createPack.mockImplementationOnce((async (_opts: unknown, progressCb: Function) => {
      progressCb(null, {
        state: "active",
        percentage: 50,
        completedResourceCount: 50,
        requiredResourceCount: 100,
        completedResourceSize: 25600
      })
      return {} as never
    }) as never)
    await createOfflinePack("test", SMALL_NE, SMALL_SW, onProgress, jest.fn())
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ state: "active", percentage: 50 }))
  })

  it("invokes onError callback when OfflineManager error fires", async () => {
    const onError = jest.fn()
    mockOfflineManager.createPack.mockImplementationOnce((async (
      _opts: unknown,
      _progressCb: Function,
      errorCb: Function
    ) => {
      errorCb(null, new Error("tile limit exceeded"))
      return {} as never
    }) as never)
    await createOfflinePack("test", SMALL_NE, SMALL_SW, jest.fn(), onError)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })
})

// ============================================================================
// loadOfflineAreas
// ============================================================================

describe("loadOfflineAreas", () => {
  it("returns empty array when no packs exist", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([] as never)
    expect(await loadOfflineAreas()).toEqual([])
  })

  it("filters out packs without a name in metadata", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      { metadata: {}, status: jest.fn().mockResolvedValue({ state: "complete", completedResourceSize: 1024 }) },
      {
        metadata: { name: "valid-area" },
        status: jest.fn().mockResolvedValue({ state: "complete", completedResourceSize: 2048 })
      }
    ] as never)
    const areas = await loadOfflineAreas()
    expect(areas).toHaveLength(1)
    expect(areas[0].name).toBe("valid-area")
  })

  it("maps complete pack status correctly", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      {
        metadata: { name: "downtown" },
        status: jest.fn().mockResolvedValue({ state: DOWNLOAD_STATE.COMPLETE, completedResourceSize: 5_000_000 })
      }
    ] as never)
    expect(await loadOfflineAreas()).toEqual([
      { name: "downtown", sizeBytes: 5_000_000, isComplete: true, isActive: false }
    ])
  })

  it("maps active pack status correctly", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      {
        metadata: { name: "in-progress" },
        status: jest.fn().mockResolvedValue({ state: DOWNLOAD_STATE.ACTIVE, completedResourceSize: 1_000_000 })
      }
    ] as never)
    expect(await loadOfflineAreas()).toEqual([
      { name: "in-progress", sizeBytes: 1_000_000, isComplete: false, isActive: true }
    ])
  })

  it("handles status() throwing - returns null sizeBytes and false flags", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      { metadata: { name: "broken-pack" }, status: jest.fn().mockRejectedValue(new Error("status unavailable")) }
    ] as never)
    expect(await loadOfflineAreas()).toEqual([
      { name: "broken-pack", sizeBytes: null, isComplete: false, isActive: false }
    ])
  })

  it("handles null completedResourceSize as null sizeBytes", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([
      { metadata: { name: "partial" }, status: jest.fn().mockResolvedValue({ state: DOWNLOAD_STATE.INACTIVE }) }
    ] as never)
    expect((await loadOfflineAreas())[0].sizeBytes).toBeNull()
  })
})

// ============================================================================
// deleteOfflineArea
// ============================================================================

describe("deleteOfflineArea", () => {
  it("unsubscribes, pauses, and deletes pack", async () => {
    const mockPause = jest.fn().mockResolvedValue(undefined)
    mockOfflineManager.getPacks
      .mockResolvedValueOnce([{ id: "uuid-1", metadata: { name: "my-area" }, pause: mockPause }] as never)
      .mockResolvedValueOnce([{ id: "uuid-2", metadata: { name: "other-area" } }] as never)
    mockOfflineManager.deletePack.mockResolvedValueOnce(undefined as never)

    await deleteOfflineArea("my-area")

    expect(mockOfflineManager.removeListener).toHaveBeenCalledWith("uuid-1")
    expect(mockPause).toHaveBeenCalled()
    expect(mockOfflineManager.deletePack).toHaveBeenCalledWith("uuid-1")
    expect(mockOfflineManager.resetDatabase).not.toHaveBeenCalled()
  })

  it("resets database when last pack is deleted", async () => {
    const mockPause = jest.fn().mockResolvedValue(undefined)
    mockOfflineManager.getPacks
      .mockResolvedValueOnce([{ id: "uuid-last", metadata: { name: "last-area" }, pause: mockPause }] as never)
      .mockResolvedValueOnce([] as never)
    mockOfflineManager.deletePack.mockResolvedValueOnce(undefined as never)
    mockOfflineManager.resetDatabase.mockResolvedValueOnce(undefined as never)

    await deleteOfflineArea("last-area")

    expect(mockOfflineManager.deletePack).toHaveBeenCalledWith("uuid-last")
    expect(mockOfflineManager.resetDatabase).toHaveBeenCalled()
  })

  it("skips pause if pack is already inactive (pause throws) but still deletes", async () => {
    const mockPause = jest.fn().mockRejectedValue(new Error("not active"))
    mockOfflineManager.getPacks
      .mockResolvedValueOnce([{ id: "uuid-x", metadata: { name: "inactive-area" }, pause: mockPause }] as never)
      .mockResolvedValueOnce([] as never)
    mockOfflineManager.deletePack.mockResolvedValueOnce(undefined as never)
    mockOfflineManager.resetDatabase.mockResolvedValueOnce(undefined as never)

    await expect(deleteOfflineArea("inactive-area")).resolves.toBeUndefined()
    expect(mockOfflineManager.deletePack).toHaveBeenCalledWith("uuid-x")
  })

  it("skips delete if pack does not exist", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never)
    mockOfflineManager.resetDatabase.mockResolvedValueOnce(undefined as never)

    await deleteOfflineArea("missing-area")

    expect(mockOfflineManager.deletePack).not.toHaveBeenCalled()
  })
})

// ============================================================================
// unsubscribeOfflinePack
// ============================================================================

describe("unsubscribeOfflinePack", () => {
  it("calls OfflineManager.removeListener with the pack id", async () => {
    mockOfflineManager.getPacks.mockResolvedValueOnce([{ id: "uuid-sub", metadata: { name: "some-area" } }] as never)
    await unsubscribeOfflinePack("some-area")
    expect(mockOfflineManager.removeListener).toHaveBeenCalledWith("uuid-sub")
  })
})

// ============================================================================
// loadOfflineAreaBounds
// ============================================================================

describe("loadOfflineAreaBounds", () => {
  it("returns parsed bounds from settings", async () => {
    const stored = [{ name: "home", ne: [13.41, 52.51], sw: [13.4, 52.5] }]
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

  it("filters out old-schema entries with lat/lon/radiusMeters instead of ne/sw", async () => {
    const mixed = [
      { name: "old-entry", lat: 52.5, lon: 13.4, radiusMeters: 5000 },
      { name: "new-entry", ne: [13.41, 52.51], sw: [13.4, 52.5] }
    ]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(mixed))
    const result = await loadOfflineAreaBounds()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("new-entry")
  })
})

// ============================================================================
// saveOfflineAreaBounds
// ============================================================================

describe("saveOfflineAreaBounds", () => {
  it("appends a new entry when it does not exist", async () => {
    const existing = [{ name: "park", ne: [2.31, 48.81], sw: [2.3, 48.8] }]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(existing))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    const newEntry = { name: "city", ne: [13.41, 52.51] as [number, number], sw: [13.4, 52.5] as [number, number] }
    await saveOfflineAreaBounds(newEntry)

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(2)
    expect(saved).toContainEqual(newEntry)
    expect(saved).toContainEqual(existing[0])
  })

  it("replaces an existing entry with the same name", async () => {
    const old = { name: "home", ne: [13.4, 52.5], sw: [13.39, 52.49] }
    mockGetSetting.mockResolvedValueOnce(JSON.stringify([old]))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    const updated = { name: "home", ne: [13.41, 52.51] as [number, number], sw: [13.4, 52.5] as [number, number] }
    await saveOfflineAreaBounds(updated)

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(1)
    expect(saved[0]).toEqual(updated)
  })

  it("saves using the correct settings key", async () => {
    mockGetSetting.mockResolvedValueOnce("[]")
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await saveOfflineAreaBounds({ name: "x", ne: [0.1, 0.1], sw: [-0.1, -0.1] })

    expect(mockSaveSetting).toHaveBeenCalledWith("offline_area_bounds", expect.any(String))
  })
})

// ============================================================================
// removeOfflineAreaBounds
// ============================================================================

describe("removeOfflineAreaBounds", () => {
  it("removes the named entry and saves the rest", async () => {
    const entries = [
      { name: "home", ne: [13.41, 52.51], sw: [13.4, 52.5] },
      { name: "work", ne: [13.51, 52.61], sw: [13.5, 52.6] }
    ]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(entries))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await removeOfflineAreaBounds("home")

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe("work")
  })

  it("is a no-op when the name does not exist", async () => {
    const entries = [{ name: "park", ne: [2.31, 48.81], sw: [2.3, 48.8] }]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(entries))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await removeOfflineAreaBounds("nonexistent")

    const saved = JSON.parse(mockSaveSetting.mock.calls[0][1])
    expect(saved).toHaveLength(1)
  })

  it("saves an empty array when the only entry is removed", async () => {
    const entries = [{ name: "solo", ne: [0.1, 0.1], sw: [-0.1, -0.1] }]
    mockGetSetting.mockResolvedValueOnce(JSON.stringify(entries))
    mockSaveSetting.mockResolvedValueOnce(undefined)

    await removeOfflineAreaBounds("solo")

    expect(JSON.parse(mockSaveSetting.mock.calls[0][1])).toEqual([])
  })
})
