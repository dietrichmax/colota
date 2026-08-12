import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { spawnSync } from "node:child_process"
import type { AddressInfo, Socket } from "node:net"

// A target that accepts connections but never replies, so a batch stays in flight
// long enough to assert the queue limit.
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
  // every point fans out to its own request per target, so one oversized batch
  // would flood every downstream service before the client even waits
  assert.equal((await post("/overland", batch(4), withKey)).status, 413)
})

test("POST /overland pushes back once MAX_QUEUED_POINTS is in flight (429)", async () => {
  // under-cap batches must not stack up either: the first is still forwarding to a
  // target that never replies, so the second has to be refused rather than queued
  assert.equal((await post("/overland", batch(3), withKey)).status, 201)
  assert.equal((await post("/overland", batch(3), withKey)).status, 429)
})
