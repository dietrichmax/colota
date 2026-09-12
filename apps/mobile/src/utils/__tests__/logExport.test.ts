import { APP_LOG_COVERAGE, buildAppLog, buildExportHeader, getMergedLogs } from "../logExport"

const mockGetLogEntries = jest.fn()
const mockGetNativeLogs = jest.fn()
const mockWriteFile = jest.fn()
const mockShareFile = jest.fn()

jest.mock("../logger", () => ({
  getLogEntries: (...args: any[]) => mockGetLogEntries(...args),
  MAX_BUFFER_SIZE: 2000,
  logger: { error: jest.fn() }
}))

jest.mock("../../services/NativeLocationService", () => {
  const service = {
    getNativeLogs: (...args: any[]) => mockGetNativeLogs(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    shareFile: (...args: any[]) => mockShareFile(...args)
  }
  return { __esModule: true, default: service }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockGetLogEntries.mockReturnValue([])
  mockGetNativeLogs.mockResolvedValue([])
  mockWriteFile.mockResolvedValue("/tmp/logs.txt")
  mockShareFile.mockResolvedValue(undefined)
})

describe("getMergedLogs", () => {
  it("returns empty array when no logs exist", async () => {
    const result = await getMergedLogs()
    expect(result).toEqual([])
  })

  it("merges JS log entries", async () => {
    mockGetLogEntries.mockReturnValue([
      { timestamp: "2026-03-31T10:00:00.000Z", level: "INFO", message: "test message" },
      { timestamp: "2026-03-31T10:00:01.000Z", level: "ERROR", message: "bad thing" }
    ])

    const result = await getMergedLogs()

    expect(result).toHaveLength(2)
    expect(result[0].source).toBe("JS")
    expect(result[0].level).toBe("INFO")
    expect(result[0].message).toBe("test message")
    expect(result[0].id).toBe("js-0")
    expect(result[1].level).toBe("ERROR")
    expect(result[1].message).toBe("bad thing")
  })

  it("merges native logcat entries with level extraction", async () => {
    mockGetNativeLogs.mockResolvedValue([
      "03-31 10:00:02.000  1234  5678 D Colota.Service: Location received",
      "03-31 10:00:03.000  1234  5678 E Colota.Sync: Network error",
      "03-31 10:00:04.000  1234  5678 W Colota.Boot: Slow start",
      "03-31 10:00:05.000  1234  5678 I Colota.Profile: Switched"
    ])

    const result = await getMergedLogs()

    expect(result).toHaveLength(4)
    expect(result[0].level).toBe("DEBUG")
    expect(result[0].source).toBe("NATIVE")
    expect(result[1].level).toBe("ERROR")
    expect(result[2].level).toBe("WARN")
    expect(result[3].level).toBe("INFO")
  })

  it("parses AppFileLogger format entries with year-qualified timestamps", async () => {
    mockGetNativeLogs.mockResolvedValue([
      "2026-03-31 10:00:02.000 DEBUG/Service: Location received",
      "2026-03-31 10:00:03.000 ERROR/Sync: Network error",
      "2026-03-31 10:00:04.000 WARN/Boot: Slow start",
      "2026-03-31 10:00:05.000 INFO/Profile: Switched"
    ])

    const result = await getMergedLogs()

    expect(result).toHaveLength(4)
    expect(result[0].level).toBe("DEBUG")
    expect(result[1].level).toBe("ERROR")
    expect(result[2].level).toBe("WARN")
    expect(result[3].level).toBe("INFO")
    expect(result[1].time).toBeGreaterThan(result[0].time)
    expect(result[3].time).toBeGreaterThan(result[2].time)
  })

  it("sorts merged entries chronologically", async () => {
    // Use timestamps far apart to avoid timezone issues
    const year = new Date().getFullYear()
    mockGetLogEntries.mockReturnValue([
      { timestamp: `${year}-03-31T12:00:00.000Z`, level: "INFO", message: "js middle" }
    ])
    mockGetNativeLogs.mockResolvedValue([
      "03-31 06:00:00.000  1234  5678 D Colota.Service: native first",
      "03-31 23:00:00.000  1234  5678 I Colota.Service: native last"
    ])

    const result = await getMergedLogs()

    expect(result).toHaveLength(3)
    // Native first (06:00 local), JS middle (12:00 UTC), Native last (23:00 local)
    expect(result[0].message).toContain("native first")
    expect(result[1].message).toBe("js middle")
    expect(result[2].message).toContain("native last")
    // The stamp, pid, tid and level are stripped, so a search matches a JS line the same way.
    expect(result[0].message).toBe("Colota.Service: native first")
  })

  it("handles native log fetch failure gracefully", async () => {
    mockGetLogEntries.mockReturnValue([
      { timestamp: "2026-03-31T10:00:00.000Z", level: "INFO", message: "still works" }
    ])
    mockGetNativeLogs.mockRejectedValue(new Error("logcat failed"))

    const result = await getMergedLogs()

    expect(result).toHaveLength(1)
    expect(result[0].message).toBe("still works")
  })

  // An unparsed line is a continuation, typically a stack frame, not a category of its own. A level
  // of its own puts it outside every filter, and a time of zero pins it above everything.
  it("gives a continuation the time and level of the line it belongs to", async () => {
    mockGetNativeLogs.mockResolvedValue([
      "2026-03-31 10:00:03.000 ERROR/Sync: Network error",
      "\tat com.Colota.sync.NetworkManager.run(NetworkManager.kt:88)",
      "\tat com.Colota.sync.SyncManager.flush(SyncManager.kt:214)"
    ])

    const result = await getMergedLogs()

    expect(result).toHaveLength(3)
    expect(result.map((e) => e.level)).toEqual(["ERROR", "ERROR", "ERROR"])
    expect(result[1].time).toBe(result[0].time)
    expect(result[2].time).toBe(result[0].time)
  })

  it("keeps a leading orphan out of the way rather than pinning it above everything", async () => {
    mockGetNativeLogs.mockResolvedValue([
      "some unstructured log line",
      "2026-03-31 10:00:03.000 ERROR/Sync: Network error"
    ])

    const result = await getMergedLogs()

    expect(result).toHaveLength(2)
    expect(result[0].level).toBe("DEBUG")
    expect(result[0].time).toBe(0)
  })

  it("formats raw line correctly for JS entries", async () => {
    mockGetLogEntries.mockReturnValue([{ timestamp: "2026-03-31T10:00:00.000Z", level: "WARN", message: "check this" }])

    const result = await getMergedLogs()

    expect(result[0].raw).toBe("[2026-03-31T10:00:00.000Z] [JS] WARN check this")
  })

  it("formats raw line correctly for native entries", async () => {
    mockGetNativeLogs.mockResolvedValue(["03-31 10:00:00.000  1234  5678 D Colota.Tag: msg"])

    const result = await getMergedLogs()

    expect(result[0].raw).toBe("[NATIVE] 03-31 10:00:00.000  1234  5678 D Colota.Tag: msg")
  })
})

describe("buildExportHeader", () => {
  // gms against foss is fused location against LocationManager, which changes what half the log
  // below can even mean.
  it("names the build, the flavor and the device", () => {
    const header = buildExportHeader(
      { VERSION_NAME: "1.16.0", VERSION_CODE: 48, FLAVOR: "gms" },
      { systemVersion: "15", apiLevel: "35", brand: "Google", model: "Pixel 8" },
      0,
      Date.parse("2026-09-09T14:22:07.000Z")
    )

    expect(header).toContain("=== Colota log export ===")
    expect(header).toContain("App: 1.16.0 (48) gms")
    expect(header).toContain("Android: 15 (API 35)")
    expect(header).toContain("Device: Google Pixel 8")
  })

  it("names the capture window only when one was recorded", () => {
    const withStart = buildExportHeader(null, null, Date.parse("2026-09-09T09:41:12.000Z"), Date.now())
    expect(withStart).toContain("Recording started:")
    expect(buildExportHeader(null, null, 0, Date.now())).not.toContain("Recording started:")
  })

  it("still writes a header when neither block could be read", () => {
    expect(buildExportHeader(null, null, 0, Date.now())).toContain("=== Colota log export ===")
  })
})

describe("buildAppLog", () => {
  // Native places these by timestamp, so they must be in AppFileLogger's exact shape or the merge
  // cannot read them and they all sink to the tail.
  it("writes the buffer in the file logger's own line shape", () => {
    mockGetLogEntries.mockReturnValue([{ timestamp: "2026-03-31T10:00:00.000Z", level: "WARN", message: "check this" }])

    const lines = buildAppLog().trimEnd().split("\n")

    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} WARN\/JS: check this$/)
  })

  // The buffer is process-lifetime while the recorded file spans restarts, so a merged stream
  // implies the app was quiet before this launch unless something says where its coverage starts.
  it("marks where its coverage starts, once", () => {
    mockGetLogEntries.mockReturnValue([
      { timestamp: "2026-03-31T10:00:00.000Z", level: "INFO", message: "one" },
      { timestamp: "2026-03-31T10:00:01.000Z", level: "INFO", message: "two" }
    ])

    const out = buildAppLog()

    expect(out.split(APP_LOG_COVERAGE)).toHaveLength(2)
    expect(out.indexOf(APP_LOG_COVERAGE)).toBeLessThan(out.indexOf("one"))
    expect(APP_LOG_COVERAGE).toContain("this session only")
  })

  it("writes nothing at all rather than a marker over an empty buffer", () => {
    mockGetLogEntries.mockReturnValue([])
    expect(buildAppLog()).toBe("")
  })
})
