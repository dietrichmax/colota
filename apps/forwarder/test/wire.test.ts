import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

// The app's WireFixturesTest pins these files to what PayloadBuilder sends.
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/wire/${name}`, import.meta.url), "utf8"))

type Received = { path: string; query: URLSearchParams; body: Record<string, unknown> }
let received: Received[] = []
const recorder = createServer((req, res) => {
  let data = ""
  req.on("data", (chunk) => (data += chunk))
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://x")
    received.push({ path: url.pathname, query: url.searchParams, body: data ? JSON.parse(data) : {} })
    res.end()
  })
})
await new Promise<void>((resolve) => recorder.listen(0, "127.0.0.1", () => resolve()))
const origin = `http://127.0.0.1:${(recorder.address() as AddressInfo).port}`

process.env.API_KEY = "secret"
process.env.TARGET_1_URL = `${origin}/owntracks`
process.env.TARGET_1_TYPE = "owntracks"
process.env.TARGET_2_URL = `${origin}/traccar-get`
process.env.TARGET_2_TYPE = "traccar"
process.env.TARGET_3_URL = `${origin}/traccar-post`
process.env.TARGET_3_TYPE = "traccar"
process.env.TARGET_3_METHOD = "POST"
process.env.TARGET_4_URL = `${origin}/colota`
process.env.TARGET_4_TYPE = "colota"
process.env.TARGET_5_URL = `${origin}/overland`
process.env.TARGET_5_TYPE = "overland"
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

// The forward runs after the response, so wait for every expected request to arrive.
async function deliveries(count: number): Promise<Map<string, Received>> {
  const deadline = Date.now() + 5000
  while (received.length < count) {
    if (Date.now() > deadline) throw new Error(`expected ${count} deliveries, got ${received.length}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return new Map(received.map((r) => [r.path, r]))
}

// Traccar reads "…40Z" and "…40.000Z" alike, so compare the instant.
function traccarJson(body: Record<string, unknown>): Record<string, unknown> {
  const location = body.location as Record<string, unknown>
  return { ...body, location: { ...location, timestamp: Date.parse(location.timestamp as string) } }
}

const owntracksPoint = {
  _type: "location",
  tid: "pixel",
  lat: 48.1372,
  lon: 11.5761,
  tst: 1763200000,
  acc: 8,
  batt: 82,
  bs: 1,
  alt: 520,
  vel: 1.4,
  cog: 90.5,
  inregions: ["Home"]
}

test("Colota's field-mapped point reaches each target type in the shape that backend expects", async () => {
  received = []
  const res = await post("/locations", fixture("location.json"))
  assert.equal(res.status, 200)
  const got = await deliveries(5)

  assert.deepEqual(got.get("/colota")?.body, fixture("location.json"))
  assert.deepEqual(got.get("/owntracks")?.body, owntracksPoint)
  // the forwarder must send Traccar what Colota itself sends it with the Traccar JSON format
  assert.deepEqual(traccarJson(got.get("/traccar-post")!.body), traccarJson(fixture("traccar-json.json")))
  assert.equal(got.get("/traccar-get")?.query.get("id"), "pixel")
  assert.equal(got.get("/traccar-get")?.query.get("timestamp"), "1763200000")
})

test("Colota's field-mapped geofence event becomes an OwnTracks transition and skips Traccar", async () => {
  received = []
  const res = await post("/locations", fixture("transition.json"))
  assert.equal(((await res.json()) as { forwarded: number }).forwarded, 3)
  const got = await deliveries(3)

  assert.deepEqual(got.get("/colota")?.body, fixture("transition.json"))
  assert.deepEqual(got.get("/owntracks")?.body, {
    ...owntracksPoint,
    _type: "transition",
    event: "enter",
    wtst: 1760000000,
    desc: "Home",
    t: "c"
  })
})

test("a point inside Colota's Overland batch reaches every target as the same point it sends field-mapped", async () => {
  received = []
  const res = await post("/overland", fixture("overland-batch.json"))
  assert.equal(res.status, 201)
  const got = await deliveries(5)

  assert.deepEqual(got.get("/overland")?.body, fixture("overland-batch.json"))
  assert.deepEqual(got.get("/colota")?.body, fixture("location.json"))
  assert.deepEqual(got.get("/owntracks")?.body, owntracksPoint)
  assert.deepEqual(traccarJson(got.get("/traccar-post")!.body), traccarJson(fixture("traccar-json.json")))
})

test("Colota's Overland geofence events reach the overland target unchanged", async () => {
  received = []
  // Colota deletes the events once it gets this 201
  const res = await post("/overland", fixture("overland-transitions.json"))
  assert.equal(res.status, 201)
  const got = await deliveries(1)

  assert.deepEqual(got.get("/overland")?.body, fixture("overland-transitions.json"))
})
