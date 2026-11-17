import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

// One recording server stands in for every target; the path tells them apart.
type Received = { path: string; body: Record<string, unknown> }
const received: Received[] = []
const recorder = createServer((req, res) => {
  let data = ""
  req.on("data", (chunk) => (data += chunk))
  req.on("end", () => {
    received.push({ path: req.url ?? "", body: data ? JSON.parse(data) : {} })
    res.end()
  })
})
await new Promise<void>((resolve) => recorder.listen(0, "127.0.0.1", () => resolve()))
const origin = `http://127.0.0.1:${(recorder.address() as AddressInfo).port}`

process.env.API_KEY = "secret"
process.env.TARGET_1_URL = `${origin}/ot`
process.env.TARGET_1_TYPE = "owntracks"
process.env.TARGET_2_URL = `${origin}/trc`
process.env.TARGET_2_TYPE = "traccar"
process.env.TARGET_3_URL = `${origin}/col`
process.env.TARGET_3_TYPE = "colota"
process.env.TARGET_4_URL = `${origin}/ovl`
process.env.TARGET_4_TYPE = "overland"
const { app } = await import("../src/app")

let server: Server
let base: string
before(() => {
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => {
  server.close()
  recorder.close()
})

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "secret" },
    body: JSON.stringify(body)
  })

// The forward runs after the response, so wait until the target has seen it.
async function delivered(
  path: string,
  match: (body: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const hit = received.find((r) => r.path === path && match(r.body))
    if (hit) return hit.body
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`nothing matching reached ${path}`)
}

// What Colota 1.22 posts for a field-mapped geofence event: the point's payload plus the transition keys
const event = {
  lat: 1,
  lon: 2,
  tst: 100,
  acc: 5,
  batt: 90,
  bs: 2,
  tid: "pixel",
  inregions: ["Home"],
  _type: "transition",
  event: "enter",
  desc: "Home",
  t: "c",
  wtst: 50
}

test("POST /locations sends a geofence event to an owntracks target as an OwnTracks transition", async () => {
  const res = await post("/locations", event)
  assert.equal(res.status, 200)
  // the traccar target is left out of both the forward and the count
  assert.equal(((await res.json()) as { forwarded: number }).forwarded, 3)
  const ot = await delivered("/ot", (b) => b._type === "transition")
  assert.equal(ot.event, "enter")
  assert.equal(ot.desc, "Home")
  assert.equal(ot.wtst, 50)
  assert.deepEqual(ot.inregions, ["Home"])
})

test("POST /locations rejects a geofence event without a valid event or wtst (400)", async () => {
  // OwnTracks requires both on a transition, so the owntracks target could not use it
  const noWtst: Record<string, unknown> = { ...event }
  delete noWtst.wtst
  assert.equal((await post("/locations", noWtst)).status, 400)
  assert.equal((await post("/locations", { ...event, event: "inside" })).status, 400)
})

test("POST /overland passes Colota's geofence events through to an overland target", async () => {
  const transitions = [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [2, 1] },
      properties: { event: "leave", geofence: "Home", timestamp: "2026-11-15T10:00:00Z", horizontal_accuracy: 12 }
    }
  ]
  const res = await post("/overland", { locations: [], transitions, device_id: "pixel" })
  // Colota deletes the events on this 201, so dropping them here lost them for good
  assert.equal(res.status, 201)
  const ovl = await delivered("/ovl", (b) => Array.isArray(b.transitions))
  assert.deepEqual(ovl.transitions, transitions)
  assert.equal(ovl.device_id, "pixel")
})
