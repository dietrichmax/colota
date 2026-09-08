import { describeServer, endpointHost } from "../serverState"
import { formatDate, formatTime, loadDisplayPreferences } from "../geo"

const mockGetSetting = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: { getSetting: (...args: string[]) => mockGetSetting(...args) }
}))

beforeAll(async () => {
  mockGetSetting.mockImplementation((key: string) => Promise.resolve(key === "timeFormat" ? "24h" : ""))
  await loadDisplayPreferences()
})

const NOW = new Date(2026, 8, 9, 15, 0, 0)
const TODAY_14_02 = new Date(2026, 8, 9, 14, 2, 0).getTime()
const YESTERDAY = new Date(2026, 8, 8, 9, 14, 0).getTime()

const base = {
  offline: false,
  endpoint: "https://tracks.example.org/api",
  deviceOnline: true,
  queued: 0,
  today: 12,
  lastSyncTime: TODAY_14_02,
  lastSyncError: "",
  now: NOW
}

describe("describeServer", () => {
  it("reads offline mode first, since nothing else matters while nothing is sent", () => {
    const s = describeServer({ ...base, offline: true, endpoint: "", lastSyncError: "boom" })
    expect(s.word).toBe("Offline mode")
    expect(s.caption).toBe("12 saved today · nothing is sent")
    expect(s.rowSub).toBe("Offline - saved locally · 12 today")
  })

  it("names a missing server before a missing network", () => {
    const s = describeServer({ ...base, endpoint: "", deviceOnline: false, queued: 38 })
    expect(s.word).toBe("No server")
    expect(s.caption).toBe("38 queued on this device")
    expect(s.rowSub).toBe("No server configured")
  })

  it("says the device has no network and when it last synced", () => {
    const s = describeServer({ ...base, deviceOnline: false, queued: 3 })
    expect(s.word).toBe("No network")
    expect(s.caption).toBe(`3 queued · last sync ${formatTime(Math.floor(TODAY_14_02 / 1000))}`)
    expect(s.rowSub).toBe("tracks.example.org · 3 queued · no network")
  })

  it("puts the server's own sentence first when sync is failing, then the queue and the last success", () => {
    const s = describeServer({ ...base, lastSyncError: "HTTP 401 Unauthorized", queued: 38 })
    expect(s.word).toBe("Sync failing")
    expect(s.tone).toBe("error")
    expect(s.caption).toBe(
      `HTTP 401 Unauthorized · 38 queued · last success ${formatTime(Math.floor(TODAY_14_02 / 1000))}`
    )
    expect(s.rowSub).toBe("tracks.example.org · 38 queued · sync failing")
  })

  it("does not fabricate a verdict before the first sync", () => {
    const s = describeServer({ ...base, lastSyncTime: 0, queued: 5 })
    expect(s.word).toBe("Not synced yet")
    expect(s.caption).toBe("5 queued")
    expect(s.rowSub).toBe("tracks.example.org · 5 queued")
  })

  it("reads synced with the time today and the date otherwise, and says when the queue is empty", () => {
    const today = describeServer(base)
    expect(today.word).toBe("Synced")
    expect(today.tone).toBe("success")
    expect(today.caption).toBe(`Last sync ${formatTime(Math.floor(TODAY_14_02 / 1000))} · queue empty`)

    const older = describeServer({ ...base, lastSyncTime: YESTERDAY, queued: 2 })
    const seconds = Math.floor(YESTERDAY / 1000)
    expect(older.caption).toBe(`Last sync ${formatDate(seconds)} · ${formatTime(seconds)} · 2 queued`)
    expect(older.rowSub).toBe(
      `tracks.example.org · 2 queued · last sync ${formatDate(seconds)} · ${formatTime(seconds)}`
    )
  })

  it("appends the certificate clause so a failing sync shows its cause on the first row", () => {
    const expiring = describeServer({
      ...base,
      certificate: { state: "expiring", days: 12, word: "Expires in 12 days", caption: "", rowSub: "" }
    })
    expect(expiring.caption).toMatch(/ · client certificate expires in 12 days$/)

    const expired = describeServer({
      ...base,
      lastSyncError: "TLS handshake failed",
      certificate: { state: "expired", days: -3, word: "Expired", caption: "", rowSub: "" }
    })
    expect(expired.caption).toMatch(/ · client certificate expired$/)
  })

  it("abbreviates a large queue the way the Settings row already did", () => {
    expect(describeServer({ ...base, lastSyncTime: 0, queued: 120_000 }).caption).toBe("120K queued")
  })
})

describe("endpointHost", () => {
  it("keeps the host for a row label and the raw text while it is not a URL yet", () => {
    expect(endpointHost("https://tracks.example.org:8443/api/v1")).toBe("tracks.example.org:8443")
    expect(endpointHost("tracks")).toBe("tracks")
  })
})
