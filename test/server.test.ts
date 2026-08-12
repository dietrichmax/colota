import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { spawnSync } from "node:child_process"
import type { AddressInfo, Socket } from "node:net"

// A target that accepts connections but never replies, so a batch stays in flight.
const sockets = new Set<Socket>()
const sink = createServer(() => {})
sink.on("connection", (s) => {
  sockets.add(s)
  s.on("close", () => sockets.delete(s))
})
await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", () => resolve()))

process.env.API_KEY = "secret"
process.env.TARGET_1_URL = `http://127.0.0.1:${(sink.address() as AddressInfo).port}/`
process.env.FORWARD_TIMEOUT_MS = "2000"
process.env.MAX_BATCH_POINTS = "3"
process.env.MAX_QUEUED_POINTS = "4"
const { app } = await import("../src/app")

let server: Server
let base: string
before(() => {
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => {
  for (const s of sockets) s.destroy()
  sink.close()
  server.close()
})

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body })

const validPoint = JSON.stringify({ lat: 1, lon: 2, tst: 100, acc: 5, batt: 90, bs: 2 })
const withKey = { "x-api-key": "secret" }

test("POST without an API key is rejected (403)", async () => {
  assert.equal((await post("/locations", validPoint)).status, 403)
})

test("POST with the wrong API key is rejected (403)", async () => {
  assert.equal((await post("/locations", validPoint, { "x-api-key": "nope" })).status, 403)
})

test("POST /locations with a valid point and key is accepted (200)", async () => {
  assert.equal((await post("/locations", validPoint, withKey)).status, 200)
})

test("POST /locations with missing fields is rejected (400)", async () => {
  assert.equal((await post("/locations", JSON.stringify({ lat: 1 }), withKey)).status, 400)
})

test("malformed JSON returns 400, not 500", async () => {
  assert.equal((await post("/overland", "{bad", withKey)).status, 400)
})

test("POST /overland with a valid batch is accepted (201)", async () => {
  assert.equal((await post("/overland", JSON.stringify({ device_id: "d", locations: [] }), withKey)).status, 201)
})

test("GET /health needs no auth (200)", async () => {
  assert.equal((await fetch(base + "/health")).status, 200)
})

test("GET /health keeps its documented shape but hides delivery detail without the key", async () => {
  const body = (await (await fetch(base + "/health")).json()) as Record<string, unknown>
  assert.equal(body.status, "ok")
  assert.equal(typeof body.uptime, "number") // documented fields stay public
  assert.equal(body.targets, 1)
  assert.equal(body.delivery, undefined) // how healthy your targets are is not public
})

test("GET /health ignores ?api_key= — a key in a GET URL ends up in proxy logs", async () => {
  const body = (await (await fetch(`${base}/health?api_key=secret`)).json()) as Record<string, unknown>
  assert.equal(body.status, "ok")
  assert.equal(body.delivery, undefined) // header only, even though the key is correct
})

test("GET /health with the key reports every target's delivery counts", async () => {
  const body = (await (await fetch(base + "/health", { headers: withKey })).json()) as {
    delivery: { target: number; host: string; ok: number; failed: number }[]
  }
  assert.equal(body.delivery.length, 1) // one entry per configured target, in config order
  assert.equal(body.delivery[0].target, 1) // the n in TARGET_n
  assert.match(body.delivery[0].host, /^127\.0\.0\.1:\d+$/) // host:port, no path
  assert.equal(typeof body.delivery[0].ok, "number")
  assert.equal(typeof body.delivery[0].failed, "number")
})

test("refuses to start while API_KEY is still the example value", () => {
  const run = spawnSync(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: { ...process.env, API_KEY: "your-secret-key" },
    encoding: "utf8",
    timeout: 30_000
  })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /example value/)
})

const overlandPoint = { geometry: { coordinates: [1, 2] } }
const batch = (n: number) =>
  JSON.stringify({ device_id: "d", locations: Array.from({ length: n }, () => overlandPoint) })

test("POST /overland rejects a batch over MAX_BATCH_POINTS (413)", async () => {
  // every point fans out to its own request per target, so one oversized batch floods them all
  assert.equal((await post("/overland", batch(4), withKey)).status, 413)
})

test("POST /overland pushes back once MAX_QUEUED_POINTS is in flight (503)", async () => {
  // under-cap batches must not stack up either. 5xx specifically: Colota answers a 4xx
  // by splitting the batch and retrying both halves at once.
  assert.equal((await post("/overland", batch(3), withKey)).status, 201)
  const res = await post("/overland", batch(3), withKey)
  assert.equal(res.status, 503)
  assert.equal(res.headers.get("retry-after"), "60")
})
