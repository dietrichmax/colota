import type { ImportPreview } from "../../services/ImportService"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER } from "../fileFormats"
import { formatDateWithYear } from "../geo"
import {
  autoExportSub,
  backupFirstSub,
  commitConfirm,
  commitLabel,
  emptyPreviewCopy,
  exportLine,
  exportResultLine,
  importErrorMessage,
  importSourceLine,
  previewHeadline,
  queueHint,
  readableFormats,
  skippedLine,
  transferRowSub
} from "../locationTransfer"

const START = 1552348800
const END = 1788854400

const preview = (over: Partial<ImportPreview> = {}): ImportPreview => ({
  format: "geojson",
  totalParsed: 15908,
  invalid: 12,
  duplicates: 12415,
  newRows: 3481,
  dateRangeStartSec: START,
  dateRangeEndSec: END,
  canQueueForSync: true,
  ...over
})

const auto = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  running: false,
  format: "geojson",
  interval: "daily",
  uri: "content://tree/Documents%2FColota",
  lastError: null as string | null,
  retentionCount: 10,
  ...over
})

describe("readableFormats", () => {
  it("comes from the shared table, so a new format lands without touching a screen", () => {
    expect(readableFormats()).toBe("GeoJSON, GPX, KML, Google Timeline, CSV")
  })

  it("folds the legacy Timeline parser into its sibling rather than naming one noun twice", () => {
    expect(IMPORT_FORMAT_ORDER).toContain("google_timeline_legacy")
    expect(FILE_FORMATS.google_timeline_legacy.label).toBe("Google Timeline (legacy)")
    expect(readableFormats().match(/Google Timeline/g)).toHaveLength(1)
  })
})

describe("exportLine", () => {
  it("names the scope and says the file is handed over, never saved", () => {
    const line = exportLine(12483)
    expect(line).toContain("All 12,483 locations in one file, oldest first.")
    expect(line).toContain("is not kept here")
    expect(line).not.toMatch(/saved/i)
  })

  it("has a line for an empty database instead of a whole empty screen", () => {
    expect(exportLine(0)).toBe("Nothing to export yet.")
  })

  it("reports the format the run actually wrote", () => {
    expect(exportResultLine(12483, "gpx")).toBe("Exported 12,483 locations as GPX and handed the file over.")
  })
})

describe("importSourceLine", () => {
  it("says the format is not a choice, because the parser decides from the file", () => {
    const line = importSourceLine()
    expect(line).toContain("The format is read from the file, so there is nothing to choose.")
  })

  // The CSV caveat is the one thing a user has to prepare by hand, so it comes from the table
  // verbatim rather than being rewritten here.
  it("carries the CSV header caveat from the shared table", () => {
    expect(importSourceLine()).toContain(FILE_FORMATS.csv.importHint as string)
  })
})

describe("backupFirstSub", () => {
  it("says the only way back is a restore, since the commit is INSERT-only", () => {
    expect(backupFirstSub()).toBe("An import cannot be undone. A backup is the only way back.")
  })
})

describe("previewHeadline", () => {
  it("leads with the number that decides the press, then where it came from", () => {
    expect(previewHeadline(preview())).toEqual({
      label: "3,481 new locations",
      caption: `GeoJSON · ${formatDateWithYear(START)} to ${formatDateWithYear(END)}`
    })
  })

  it("drops the span when the file carried no dates rather than printing a placeholder", () => {
    const { caption } = previewHeadline(preview({ dateRangeStartSec: null, dateRangeEndSec: null }))
    expect(caption).toBe("GeoJSON")
  })
})

describe("skippedLine", () => {
  it("folds both skip reasons into one sentence", () => {
    expect(skippedLine(preview())).toBe("Skipping 12,415 duplicates and 12 unusable rows.")
  })

  it("names only the reason that applies, and agrees with a count of one", () => {
    expect(skippedLine(preview({ invalid: 0 }))).toBe("Skipping 12,415 duplicates.")
    expect(skippedLine(preview({ duplicates: 0 }))).toBe("Skipping 12 unusable rows.")
    expect(skippedLine(preview({ duplicates: 1, invalid: 0 }))).toBe("Skipping 1 duplicate.")
  })

  // Three permanent counts made the card a ledger of zeroes. Nothing skipped means nothing said.
  it("says nothing when the import takes everything", () => {
    expect(skippedLine(preview({ duplicates: 0, invalid: 0 }))).toBeUndefined()
  })
})

describe("commitConfirm", () => {
  it("carries the reasoning the staged card no longer shows", () => {
    const copy = commitConfirm(preview(), false)
    expect(copy.title).toBe("Import 3,481 locations?")
    expect(copy.message).toContain("Nothing already stored is changed or removed.")
    expect(copy.message).toContain("skipped rather than merged")
    expect(copy.message).toContain("Recording pauses")
    expect(copy.confirmText).toBe("Import")
  })

  // sentFlag = 1 puts them in the exact bucket clearSentHistory empties.
  it("says a plain import lands in the bucket Delete synced locations takes", () => {
    expect(commitConfirm(preview(), false).message).toContain("Delete synced locations")
  })

  it("says the queued variant reaches a server that cannot be asked to give them back", () => {
    const copy = commitConfirm(preview(), true)
    expect(copy.title).toBe("Import and queue 3,481 locations?")
    expect(copy.message).toContain("cannot recall what your server has already taken")
    expect(copy.confirmText).toBe("Import and queue")
  })

  it("mentions rejected rows only when there were some", () => {
    expect(commitConfirm(preview(), false).message).toContain("no usable time or coordinates")
    expect(commitConfirm(preview({ invalid: 0 }), false).message).not.toContain("no usable time")
  })
})

describe("commitLabel", () => {
  it("carries the count on the button, both ways", () => {
    expect(commitLabel(3481, false)).toBe("Import 3,481 locations")
    expect(commitLabel(3481, true)).toBe("Import and queue 3,481")
    expect(commitLabel(1, false)).toBe("Import 1 location")
  })
})

describe("queueHint", () => {
  it("says where they go", () => {
    expect(queueHint(3481)).toBe("Sends 3,481 locations to your server too.")
  })
})

describe("emptyPreviewCopy", () => {
  // The shipped screen said "no locations were found" for all three of these.
  it("separates an empty file from a file of unusable rows", () => {
    expect(emptyPreviewCopy(preview({ totalParsed: 0, invalid: 0, duplicates: 0, newRows: 0 }))).toBe(
      "No locations were found in this file."
    )
    expect(emptyPreviewCopy(preview({ totalParsed: 0, invalid: 12004, duplicates: 0, newRows: 0 }))).toContain(
      "12,004 rows had no usable time or coordinates"
    )
  })

  it("says duplicates were counted against the file too, not only against history", () => {
    const line = emptyPreviewCopy(preview({ newRows: 0, duplicates: 3481 }))
    expect(line).toContain("counted both inside the file and against what is already stored")
  })
})

describe("importErrorMessage", () => {
  it("derives the format list rather than keeping a second copy, and names the DOCTYPE refusal", () => {
    const line = importErrorMessage("E_IMPORT_UNSUPPORTED")
    expect(line).toContain(readableFormats())
    expect(line).toContain("DOCTYPE")
  })

  // The old string claimed a lock over backup and restore that the import mutex does not hold.
  it("claims only the scope the import mutex actually has", () => {
    expect(importErrorMessage("E_BUSY")).toBe("Another import is already running.")
  })

  it("has a sentence for an expired stash and a fallback for anything else", () => {
    expect(importErrorMessage("E_IMPORT_NO_PENDING")).toContain("expired")
    expect(importErrorMessage(undefined)).toBe("The file could not be read.")
  })
})

describe("autoExportSub", () => {
  it("reports the schedule, the format and how many files survive", () => {
    expect(autoExportSub(auto())).toBe("Daily · GeoJSON · 10 files kept")
  })

  it("names a missing folder, which is what blocks the switch", () => {
    expect(autoExportSub(auto({ uri: null }))).toBe("No folder chosen")
  })

  // The worker turns the feature off and sets the flag, so "Off" alone hid the one real failure.
  it("tells a lost folder grant apart from the user turning it off", () => {
    expect(autoExportSub(auto({ enabled: false, lastError: "permission" }))).toBe("Stopped, folder access lost")
    expect(autoExportSub(auto({ enabled: false, lastError: null }))).toBe("Off")
  })

  it("says a run is in progress and carries a failed last run", () => {
    expect(autoExportSub(auto({ running: true }))).toBe("Export running")
    expect(autoExportSub(auto({ lastError: "Folder not writable" }))).toContain("last export failed")
  })
})

describe("transferRowSub", () => {
  // The auto-export row left the hub, so this row is the only place its failure can surface.
  it("carries the auto-export state when there is one", () => {
    // Only the first word is lowered, or the format name comes out as "geojson".
    expect(transferRowSub(auto())).toBe("Auto-export daily · GeoJSON · 10 files kept")
    expect(transferRowSub(auto({ enabled: false, lastError: "permission" }))).toBe(
      "Auto-export stopped, folder access lost"
    )
  })

  it("falls back to the nouns inside the screen when nothing is scheduled", () => {
    expect(transferRowSub(null)).toBe(`${readableFormats()} in, and out`)
    expect(transferRowSub(auto({ enabled: false, lastError: null }))).toContain("in, and out")
  })
})
