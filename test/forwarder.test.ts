import { test, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { forwardBatch, forwardToAll, getDeliveryStats, type OverlandEnvelope } from "../src/forwarder"
import type { Target } from "../src/targets"
import { overlandFeatureToColota, type ColotaPayload } from "../src/transform"

// Capture outbound requests instead of hitting the network.
const realFetch = globalThis.fetch
type Call = { url: string; method?: string; headers?: Record<string, string>; body: unknown }
let calls: Call[] = []

beforeEach(() => {
  calls = []
  globalThis.fetch = (async (
    url: string | URL,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: init?.headers,
      body: init?.body ? JSON.parse(init.body) : undefined
    })
    return { ok: true, status: 200, text: async () => "" } as unknown as Response
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = realFetch
})

const pt = (tst: number, lat = 1): ColotaPayload => ({ lat, lon: 2, acc: 5, batt: 90, bs: 2, tst })

test("forwardBatch sends the whole envelope to an overland target once", async () => {
  const targets: Target[] = [{ url: "http://ovl", type: "overland" }]
  const env: OverlandEnvelope = { locations: [{}, {}, {}], device_id: "d" }
  await forwardBatch(targets, env, [pt(1), pt(2), pt(3)])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "http://ovl")
  assert.equal((calls[0].body as { locations: unknown[] }).locations.length, 3)
})

test("forwardBatch with batchMode=latest sends only the newest point", async () => {
  const targets: Target[] = [{ url: "http://ha", type: "colota", batchMode: "latest" }]
  await forwardBatch(targets, { locations: [], device_id: "d" }, [pt(10, 1), pt(30, 3), pt(20, 2)])
  assert.equal(calls.length, 1)
  assert.equal((calls[0].body as { lat: number }).lat, 3) // newest tst=30 -> lat 3
})

test("forwardBatch splits into one request per point for non-overland targets", async () => {
  const targets: Target[] = [{ url: "http://raw", type: "raw" }]
  await forwardBatch(targets, { locations: [], device_id: "d" }, [pt(1), pt(2), pt(3)])
  assert.equal(calls.length, 3)
})

test("forwardBatch matches filter_tid against device_id once", async () => {
  const targets: Target[] = [
    { url: "http://yes", type: "raw", filter_tid: "d" },
    { url: "http://no", type: "raw", filter_tid: "other" }
  ]
  await forwardBatch(targets, { locations: [], device_id: "d" }, [pt(1)])
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.startsWith("http://yes"))
})

test("forwardToAll filters single points by payload tid", async () => {
  const targets: Target[] = [
    { url: "http://a", type: "raw" },
    { url: "http://b", type: "raw", filter_tid: "x" }
  ]
  await forwardToAll(targets, { ...pt(1), tid: "y" })
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.startsWith("http://a"))
})

test("owntracks target receives OwnTracks-shaped body + X-Limit headers", async () => {
  const targets: Target[] = [{ url: "http://ot", type: "owntracks", user: "u1" }]
  await forwardToAll(targets, { ...pt(100), tid: "phone9", alt: 50, bear: 90 })
  const c = calls[0]
  const body = c.body as Record<string, unknown>
  assert.equal(c.method, "POST")
  assert.equal(body._type, "location")
  assert.equal(body.tid, "phone9")
  assert.equal(body.cog, 90) // bear -> cog
  assert.equal(body.alt, 50)
  assert.equal(c.headers?.["X-Limit-U"], "u1")
  assert.equal(c.headers?.["X-Limit-D"], "phone9") // payload tid wins over target.device
})

test("traccar target sends a GET with OsmAnd query params and no body", async () => {
  const targets: Target[] = [{ url: "http://trc", type: "traccar", tid: "dev1" }]
  await forwardToAll(targets, pt(100))
  const c = calls[0]
  assert.equal(c.method, "GET")
  assert.equal(c.body, undefined)
  assert.match(c.url, /[?&]id=dev1\b/)
  assert.match(c.url, /[?&]lat=1\b/)
  assert.match(c.url, /[?&]timestamp=100\b/)
})

test("traccar GET keeps a query string the target URL already has", async () => {
  // concatenating "?" would make the token's value "abc?id=dev1", so auth would fail
  const targets: Target[] = [{ url: "http://trc/ingest?token=abc", type: "traccar", tid: "dev1" }]
  await forwardToAll(targets, pt(100))
  const url = new URL(calls[0].url)
  assert.equal(url.searchParams.get("token"), "abc")
  assert.equal(url.searchParams.get("id"), "dev1")
})

test("traccar POST target sends Traccar JSON, no X-Limit headers", async () => {
  const targets: Target[] = [{ url: "http://trc", type: "traccar", method: "POST", tid: "dev1" }]
  await forwardToAll(targets, pt(100))
  const c = calls[0]
  const body = c.body as { device_id: string; location: { coords: Record<string, number> } }
  assert.equal(c.method, "POST")
  assert.equal(body.device_id, "dev1")
  assert.equal(body.location.coords.latitude, 1)
  assert.equal(c.headers?.["X-Limit-U"], undefined) // only owntracks sets these
})

test("passthrough targets (raw/colota/geopulse) POST the payload unchanged", async () => {
  const targets: Target[] = [{ url: "http://raw", type: "colota" }]
  await forwardToAll(targets, { ...pt(100), alt: 5 })
  const c = calls[0]
  assert.equal(c.method, "POST")
  assert.equal(c.headers?.["Content-Type"], "application/json")
  assert.deepEqual(c.body, { lat: 1, lon: 2, acc: 5, batt: 90, bs: 2, tst: 100, alt: 5 })
})

test("forwards the Authorization header when target.auth is set", async () => {
  await forwardToAll([{ url: "http://a", type: "raw", auth: "Bearer xyz" }], pt(1))
  assert.equal(calls[0].headers?.["Authorization"], "Bearer xyz")
})

// Unique URLs per test: the counters are module state, keyed by target URL.
test("delivery stats count a successful forward", async () => {
  const target: Target = { url: "http://stats-ok", type: "raw" }
  await forwardToAll([target], pt(1))
  const s = getDeliveryStats([target])[0]
  assert.equal(s.ok, 1)
  assert.equal(s.failed, 0)
  assert.ok(s.lastOkAt)
})

test("a target that rejects the point is counted as failed", async () => {
  // the client was already told "Accepted" — this counter is the only place the failure surfaces
  globalThis.fetch = (async () => ({ ok: false, status: 401, text: async () => "denied" })) as unknown as typeof fetch
  const target: Target = { url: "http://stats-401", type: "raw" }
  await forwardToAll([target], pt(1))
  const s = getDeliveryStats([target])[0]
  assert.equal(s.failed, 1)
  assert.equal(s.lastError, "HTTP 401") // status only, never the response body
})

test("a rejected point is logged without the Home Assistant webhook id, even when the target echoes it", async () => {
  // the warn line carries the masked URL and the response body, and either can hold the id
  globalThis.fetch = (async () => ({
    ok: false,
    status: 404,
    text: async () => "Cannot POST /api/webhook/hook-secret"
  })) as unknown as typeof fetch
  const warn = mock.method(console, "warn", () => {})
  try {
    const target: Target = { url: "http://ha-404:8123/api/webhook/hook-secret", type: "raw" }
    await forwardToAll([target], pt(1))
    const line = warn.mock.calls.map((c) => c.arguments.join(" ")).join("\n")
    assert.match(line, /ha-404:8123\/api\/webhook\/\*\*\* responded 404/)
    assert.doesNotMatch(line, /hook-secret/)
  } finally {
    warn.mock.restore()
  }
})

test("a network failure is recorded without exposing the target URL", async () => {
  // these counters are served over /health, so nothing here may carry a target secret
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed")
  }) as unknown as typeof fetch
  const target: Target = { url: "http://stats-down/api?api_key=SECRET", type: "raw" }
  await forwardToAll([target], pt(1))
  const s = getDeliveryStats([target])[0]
  assert.equal(s.failed, 1)
  assert.match(s.lastError!, /fetch failed/)
  assert.doesNotMatch(s.lastError!, /SECRET/)
  assert.equal(s.host, "stats-down") // host only, so no path or query can leak
})

test("delivery stats number targets by config position", () => {
  // two targets can share a host, so the number is what identifies them
  const a: Target = { url: "https://dawarich.example.com/api/v1/owntracks/points?api_key=user1", type: "raw" }
  const b: Target = { url: "https://dawarich.example.com/api/v1/owntracks/points?api_key=user2", type: "raw" }
  const s = getDeliveryStats([a, b])
  assert.deepEqual(
    s.map((x) => [x.target, x.host]),
    [
      [1, "dawarich.example.com"],
      [2, "dawarich.example.com"]
    ]
  )
})

test("a target that has never been reached still appears, with zeros", () => {
  const s = getDeliveryStats([{ url: "http://stats-unused", type: "raw" }])[0]
  assert.equal(s.ok, 0)
  assert.equal(s.failed, 0)
  assert.equal(s.lastError, undefined)
})

test("end-to-end: a Colota app Overland batch fans out correctly", async () => {
  const batch = {
    device_id: "pixel8",
    locations: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [11.5761, 48.1372] },
        properties: {
          timestamp: "2026-05-29T10:00:00Z",
          horizontal_accuracy: 5,
          altitude: 520,
          speed: 3.2,
          course: 90,
          battery_level: 0.82,
          battery_state: "charging"
        }
      }
    ]
  }
  const payloads = batch.locations.map((f) => overlandFeatureToColota(f, batch.device_id))
  await forwardBatch(
    [
      { url: "http://dawarich", type: "overland" },
      { url: "http://ha", type: "owntracks" }
    ],
    batch,
    payloads
  )

  // overland target: whole batch forwarded byte-for-byte
  const overlandCall = calls.find((c) => c.url.startsWith("http://dawarich"))!
  assert.deepEqual(overlandCall.body, batch)

  // owntracks target: the Feature is converted to an OwnTracks point
  const ot = calls.find((c) => c.url.startsWith("http://ha"))!.body as Record<string, unknown>
  assert.equal(ot._type, "location")
  assert.equal(ot.lat, 48.1372)
  assert.equal(ot.lon, 11.5761)
  assert.equal(ot.tid, "pixel8")
  assert.equal(ot.batt, 82) // 0.82 -> 82
  assert.equal(ot.bs, 2) // charging -> 2
  assert.equal(ot.alt, 520)
  assert.equal(ot.vel, 3.2)
  assert.equal(ot.cog, 90) // course -> bear -> cog
  assert.equal(ot.tst, Math.floor(Date.parse("2026-05-29T10:00:00Z") / 1000))
})
