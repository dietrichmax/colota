import type {
  OfflineAreaBounds,
  OfflineAreaInfo,
  OfflinePackStatus
} from "../../components/features/map/OfflinePackManager"
import { formatDateWithYear } from "../geo"
import {
  areaFeature,
  areasCollection,
  cornersOf,
  deleteAreaConfirm,
  describeArea,
  downloadConfirm,
  downloadLine,
  duplicateNameError,
  progressCaption,
  redownloadConfirm,
  storageMessage,
  type Bounds,
  type Estimate
} from "../offlineArea"

const BOUNDS: Bounds = [13.4, 52.5, 13.5, 52.6]
const DOWNLOADED_AT = Date.parse("2026-02-27T10:00:00Z")
const DATE = formatDateWithYear(Math.floor(DOWNLOADED_AT / 1000))

const small: Estimate = { label: "~5 MB", bytes: 5 * 1024 * 1024, large: false }
const large: Estimate = { label: "~470 MB", bytes: 470 * 1024 * 1024, large: true }

const area = (over: Partial<OfflineAreaInfo> = {}): OfflineAreaInfo => ({
  name: "Home",
  sizeBytes: 13_000_000,
  isComplete: true,
  isActive: false,
  bounds: BOUNDS,
  ...over
})

const entry = (over: Partial<OfflineAreaBounds> = {}): OfflineAreaBounds => ({
  name: "Home",
  ne: [13.5, 52.6],
  sw: [13.4, 52.5],
  styleUrl: "https://tiles.example/light.json",
  downloadedAt: DOWNLOADED_AT,
  ...over
})

const status = (percentage: number, completedResourceSize: number): OfflinePackStatus => ({
  state: "active",
  percentage,
  completedResourceCount: 0,
  requiredResourceCount: 0,
  completedResourceSize
})

describe("duplicateNameError", () => {
  it("names the clash, trimmed, and stays silent for a free name", () => {
    expect(duplicateNameError("  Home ", ["Home", "Work"])).toBe('An area named "Home" already exists.')
    expect(duplicateNameError("Lake", ["Home"])).toBeUndefined()
    expect(duplicateNameError("   ", ["Home"])).toBeUndefined()
  })
})

describe("downloadLine", () => {
  it("says why the button is disabled before it says what pressing it takes", () => {
    expect(downloadLine(null, "Lake")).toBe("Waiting for the map.")
    expect(downloadLine(small, "")).toBe("~5 MB estimated. Name the area to download it.")
    expect(downloadLine(small, "Lake")).toBe("~5 MB estimated.")
  })

  // The estimator stops counting at the tile cap, so past it the label is a floor, not a figure.
  it("calls a capped estimate a floor and tells the user how to lower it", () => {
    expect(downloadLine(large, "Lake")).toBe("At least ~470 MB. Zoom in to download less.")
  })
})

describe("progressCaption", () => {
  it("counts bytes only once some have landed", () => {
    expect(progressCaption(null)).toBe("Starting…")
    expect(progressCaption(status(42, 0))).toBe("42%")
    expect(progressCaption(status(42, 5_347_737))).toBe("42% · 5.1 MB so far")
  })
})

describe("describeArea", () => {
  it("prints the size and the date a finished download completed", () => {
    expect(describeArea(area(), entry(), "https://tiles.example/light.json").sub).toBe(`12.4 MB · ${DATE}`)
  })

  it("omits the date for an entry that never recorded one", () => {
    expect(describeArea(area(), entry({ downloadedAt: undefined }), null).sub).toBe("12.4 MB")
  })

  /**
   * The precedence matters: a pack another instance is downloading must not read as broken, a
   * status read that failed is not an interrupted download, and a stale pack is still complete.
   */
  it("orders the states so the more specific one wins", () => {
    expect(describeArea(area({ isActive: true, isComplete: false }), entry(), null)).toMatchObject({
      tone: "active",
      sub: "Downloading…"
    })
    expect(describeArea(area({ sizeBytes: null, isComplete: false }), entry(), null)).toMatchObject({
      tone: "attention",
      sub: "Could not read this area"
    })
    expect(describeArea(area({ isComplete: false, sizeBytes: 3_355_443 }), entry(), null).sub).toBe(
      "Incomplete · 3.2 MB"
    )
    expect(describeArea(area({ isComplete: false, sizeBytes: 0 }), entry(), null).sub).toBe("Incomplete")
  })

  // A stale pack is still complete, so the size and date stay beside the warning.
  it("says the map style changed, and keeps the size and date beside it", () => {
    const row = describeArea(area(), entry(), "https://tiles.example/other.json")
    expect(row.tone).toBe("attention")
    expect(row.sub).toBe(`Map style changed · 12.4 MB · ${DATE}`)
  })

  it("does not call a pack stale when either style URL is unknown", () => {
    expect(describeArea(area(), entry({ styleUrl: undefined }), "https://x").tone).toBe("plain")
    expect(describeArea(area(), entry(), null).tone).toBe("plain")
  })
})

describe("the confirmations", () => {
  it("carries the estimate, and the mobile-data sentence only when it applies", () => {
    expect(downloadConfirm("Lake", small, false)).toEqual({
      title: 'Download "Lake"?',
      message: "~5 MB estimated.",
      confirmText: "Download"
    })
    expect(downloadConfirm("Lake", small, true).message).toBe("~5 MB estimated. You are on mobile data, not WiFi.")
  })

  // Above the cap the download keeps going where the estimate stopped, which is the sentence to say.
  it("says the download outruns the estimate on a capped frame", () => {
    expect(downloadConfirm("Lake", large, false).message).toBe(
      "At least ~470 MB. The estimate stops counting at 100,000 tiles and the download does not."
    )
  })

  it("says a re-download replaces the tiles", () => {
    expect(redownloadConfirm("Home", small, false)).toEqual({
      title: 'Download "Home" again?',
      message: "Replaces its tiles with a fresh download. ~5 MB estimated.",
      confirmText: "Download again"
    })
  })

  /**
   * Deleting the last pack resets MapLibre's tile database, which the library documents as taking
   * the ambient online cache with it. That is worth a sentence, once, on the last delete only.
   */
  it("names the bytes a delete removes, and the cache reset on the last area", () => {
    expect(deleteAreaConfirm("Home", 13_000_000, false)).toEqual({
      title: 'Delete "Home"?',
      message: "Removes 12.4 MB of map tiles from this device.",
      confirmText: "Delete"
    })
    expect(deleteAreaConfirm("Home", null, false).message).toBe("Removes its map tiles from this device.")
    expect(deleteAreaConfirm("Home", 13_000_000, true).message).toBe(
      "Removes 12.4 MB of map tiles from this device. It is the last saved area, so the map's online tile cache is cleared too."
    )
  })
})

describe("storageMessage", () => {
  it("prints what is needed and what is free, as a floor when capped", () => {
    expect(storageMessage(small, 120)).toBe("~5 MB is needed and the device has 120.0 MB free.")
    expect(storageMessage(large, 120)).toBe("At least ~470 MB is needed and the device has 120.0 MB free.")
  })
})

describe("the geometry", () => {
  it("converts the map's [west, south, east, north] to the manager's corners once", () => {
    expect(cornersOf(BOUNDS)).toEqual({ ne: [13.5, 52.6], sw: [13.4, 52.5] })
  })

  it("draws a closed ring from the north-west corner", () => {
    const feature = areaFeature("Home", BOUNDS)
    expect(feature.properties).toEqual({ name: "Home" })
    expect(feature.geometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [13.4, 52.6],
          [13.5, 52.6],
          [13.5, 52.5],
          [13.4, 52.5],
          [13.4, 52.6]
        ]
      ]
    })
  })

  it("skips an area whose bounds native did not report", () => {
    const collection = areasCollection([area(), area({ name: "Broken", bounds: null })])
    expect(collection.features).toHaveLength(1)
    expect(collection.features[0].properties).toEqual({ name: "Home" })
  })
})
