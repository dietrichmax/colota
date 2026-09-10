import type { MergedLogEntry } from "../logExport"
import {
  CAPTURE_HINT,
  countByFloor,
  DEFAULT_LOG_FLOOR,
  deleteSub,
  describeCapture,
  floorOptions,
  levelLetter,
  levelWord,
  LOG_CONTENTS_LINE,
  logTime,
  nextStepLine,
  passesFloor,
  previewRowSub,
  resultLine,
  rowLabel
} from "../logCapture"

const entry = (level: MergedLogEntry["level"], message = "x", time = 1_757_400_000_000): MergedLogEntry => ({
  id: `${level}-${time}`,
  time,
  level,
  source: "NATIVE",
  message,
  raw: message
})

describe("describeCapture", () => {
  it("separates a device with a capture running from one with an old file lying around", () => {
    expect(describeCapture(true, 2_500_000, 1_757_400_000_000).label).toBe("Recording")
    expect(describeCapture(false, 2_500_000, 0).caption).toBe("2.4 MB kept from an earlier capture")
    expect(describeCapture(false, 0, 0).caption).toBe("No log file on this device")
  })

  // A reporter who has just armed it needs to see that it took, before anything is written.
  it("says recording before the first byte lands", () => {
    const state = describeCapture(true, 0, 1_757_400_000_000)
    expect(state.label).toBe("Recording")
    expect(state.caption).toBe("Nothing written yet")
  })

  /**
   * A user who had logging on before the start time was ever recorded has no window to report, and
   * printing "since 01:00" from a zero would date the capture to 1970.
   */
  it("drops the since clause rather than inventing a start", () => {
    expect(describeCapture(true, 2_500_000, 0).caption).toBe("2.4 MB written")
    expect(describeCapture(true, 2_500_000, 1_757_400_000_000).caption).toMatch(/^2\.4 MB since \d{2}:\d{2}$/)
  })
})

describe("the wording a reporter acts on", () => {
  // The step missing from every bug report: leave it on while you reproduce the problem.
  it("names the next step, and which step it is", () => {
    expect(nextStepLine(false)).toContain("Switch on Record a log file")
    expect(nextStepLine(true)).toContain("Leave this on while you reproduce")
  })

  // The bridge swaps the reader's source on the toggle and nothing has ever said so on screen.
  it("says which source the reader is showing", () => {
    expect(previewRowSub(true)).toContain("log file")
    expect(previewRowSub(false)).toContain("system log")
  })

  it("says logging survives a restart, which is the fact reporters get wrong", () => {
    expect(CAPTURE_HINT).toContain("restarts included")
  })

  /**
   * Naming the contents is the disclosure. A vague warning gives a reporter nothing to decide with,
   * and an absolute promise of no coordinates would be false exactly when it mattered: no log call
   * writes a latitude, but NetworkManager logs a rejected upload's response body, so a server that
   * echoes the payload it refused puts them in the file anyway.
   */
  it("names what leaves the device, and stops short of promising an absence", () => {
    expect(LOG_CONTENTS_LINE).toContain("geofences")
    expect(LOG_CONTENTS_LINE).toContain("tracking profiles")
    expect(LOG_CONTENTS_LINE).toContain("server host")
    expect(LOG_CONTENTS_LINE).toContain("Colota writes no coordinates")
    expect(LOG_CONTENTS_LINE).toMatch(/rejected upload can carry your server/)
  })

  it("says the capture continues after a delete, only when it does", () => {
    expect(deleteSub(2_500_000, true)).toContain("carries on")
    expect(deleteSub(2_500_000, false)).not.toContain("carries on")
  })
})

describe("the level floor", () => {
  /**
   * A floor rather than a set of levels. The counts are nested subsets, so the number on the chip
   * and the number in the result line cannot disagree, which four independent multi-select chips
   * could never guarantee.
   */
  it("admits every level at or above itself", () => {
    expect(passesFloor("DEBUG", "all")).toBe(true)
    expect(passesFloor("DEBUG", "info")).toBe(false)
    expect(passesFloor("WARN", "info")).toBe(true)
    expect(passesFloor("ERROR", "error")).toBe(true)
    expect(passesFloor("WARN", "error")).toBe(false)
  })

  it("counts nested subsets, so no two chips can contradict each other", () => {
    const counts = countByFloor([entry("DEBUG"), entry("INFO"), entry("WARN"), entry("ERROR"), entry("ERROR")])
    expect(counts).toEqual({ all: 5, info: 4, warn: 3, error: 2 })
    expect(counts.all).toBeGreaterThanOrEqual(counts.info)
    expect(counts.info).toBeGreaterThanOrEqual(counts.warn)
    expect(counts.warn).toBeGreaterThanOrEqual(counts.error)
  })

  /**
   * The preview exists to show what is being sent. Opening on WARN would show four lines of a
   * 1,204-line file and misrepresent the one thing under review.
   */
  it("opens on everything, because this previews what leaves the device", () => {
    expect(DEFAULT_LOG_FLOOR).toBe("all")
  })

  // Without the count a reporter selects Errors to learn there are four: changing state to read a fact.
  it("carries each count on its own chip", () => {
    const options = floorOptions({ all: 1204, info: 312, warn: 47, error: 4 })
    expect(options.map((o) => o.label)).toEqual(["All 1,204", "Info 312", "Warnings 47", "Errors 4"])
  })
})

describe("resultLine", () => {
  it("names the source, and says so only once", () => {
    expect(resultLine(1204, 1204, true)).toBe("1,204 lines from the log file")
    expect(resultLine(1204, 1204, false)).toBe("1,204 lines from the system log")
  })

  it("shows both numbers only while something is filtered out", () => {
    expect(resultLine(86, 1204, true)).toBe("86 of 1,204 lines from the log file")
    expect(resultLine(0, 1204, true)).toBe("0 of 1,204 lines from the log file")
  })

  it("does not print a plural for a single line", () => {
    expect(resultLine(1, 1, true)).toBe("1 line from the log file")
  })
})

describe("the log row", () => {
  /**
   * Forced to 24 hours whatever Appearance says: the file this previews is written 24-hour, and a
   * mono column whose width changes by locale defeats the face it is set in.
   */
  it("keeps the column square, including for a line with no usable time", () => {
    expect(logTime(0)).toBe("--:--:--")
    expect(logTime(1_757_400_000_000)).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it("gives one letter and one spoken word per level", () => {
    expect(levelLetter("ERROR")).toBe("E")
    expect(levelLetter("WARN")).toBe("W")
    expect(levelWord("ERROR")).toBe("Error")
    expect(levelWord("DEBUG")).toBe("Debug")
  })

  // One node per line, rather than one node holding three thousand lines.
  it("reads as a sentence to a screen reader", () => {
    expect(rowLabel(entry("ERROR", "sync failed"), "09:46:58")).toBe("Error, 09:46:58, sync failed")
  })
})
