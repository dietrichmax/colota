import { getMergedLogs, exportLogs } from "../logExport"

const mockGetLogEntries = jest.fn()
const mockGetNativeLogs = jest.fn()
const mockWriteFile = jest.fn()
const mockShareFile = jest.fn()

jest.mock("../logger", () => ({
  getLogEntries: (...args: any[]) => mockGetLogEntries(...args),
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

  it("assigns NATIVE level for unrecognized logcat format", async () => {
    mockGetNativeLogs.mockResolvedValue(["some unstructured log line"])

    const result = await getMergedLogs()

    expect(result).toHaveLength(1)
    expect(result[0].level).toBe("NATIVE")
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

describe("exportLogs", () => {
  it("writes file and opens share sheet", async () => {
    await exportLogs(
      { VERSION_NAME: "1.5.1", VERSION_CODE: 31 },
      { systemVersion: "14", apiLevel: "34", brand: "Google", model: "Pixel 7" }
    )

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const [fileName, content] = mockWriteFile.mock.calls[0]
    expect(fileName).toMatch(/^colota_logs_\d+\.txt$/)
    expect(content).toContain("=== Colota Debug Log Export ===")
    expect(content).toContain("Version: 1.5.1 (31)")
    expect(content).toContain("OS: Android 14 (API 34)")
    expect(content).toContain("Device: Google Pixel 7")

    expect(mockShareFile).toHaveBeenCalledWith("/tmp/logs.txt", "text/plain", "Colota Debug Logs")
  })

  it("works without build config and device info", async () => {
    await exportLogs(null, null)

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const content = mockWriteFile.mock.calls[0][1]
    expect(content).toContain("=== Colota Debug Log Export ===")
    expect(content).not.toContain("App Info")
    expect(content).not.toContain("Device Info")
  })

  it("includes merged log entries in export", async () => {
    mockGetLogEntries.mockReturnValue([{ timestamp: "2026-03-31T10:00:00.000Z", level: "INFO", message: "hello" }])

    await exportLogs(null, null)

    const content = mockWriteFile.mock.calls[0][1]
    expect(content).toContain("--- Log Entries (1) ---")
    expect(content).toContain("[2026-03-31T10:00:00.000Z] [JS] INFO hello")
  })
})
