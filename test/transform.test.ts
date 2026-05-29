import { test } from "node:test"
import assert from "node:assert/strict"
import { owntracksToColota, overlandFeatureToColota, transformPayload, type ColotaPayload } from "../src/transform"
import type { Target } from "../src/targets"

test("owntracksToColota maps cog->bear and defaults batt/bs", () => {
  const r = owntracksToColota({ lat: 1, lon: 2, acc: 5, tst: 100, cog: 90 })
  assert.equal(r.lat, 1)
  assert.equal(r.bear, 90)
  assert.equal(r.batt, 0)
  assert.equal(r.bs, 0)
})

test("overlandFeatureToColota parses a valid Feature", () => {
  const r = overlandFeatureToColota(
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [11.5, 48.1] },
      properties: {
        timestamp: "2026-05-29T10:00:00Z",
        horizontal_accuracy: 5,
        battery_level: 0.8,
        battery_state: "charging",
        altitude: 500,
        speed: 3,
        course: 90
      }
    },
    "phone1"
  )
  assert.equal(r.lon, 11.5)
  assert.equal(r.lat, 48.1)
  assert.equal(r.acc, 5)
  assert.equal(r.batt, 80) // 0.8 -> 80
  assert.equal(r.bs, 2) // charging -> 2
  assert.equal(r.alt, 500)
  assert.equal(r.vel, 3)
  assert.equal(r.bear, 90)
  assert.equal(r.tid, "phone1")
  assert.equal(r.tst, Math.floor(Date.parse("2026-05-29T10:00:00Z") / 1000))
})

test("overlandFeatureToColota throws on missing coordinates", () => {
  assert.throws(() =>
    overlandFeatureToColota(
      { type: "Feature", geometry: { type: "Point", coordinates: [] }, properties: {} },
      undefined
    )
  )
})

test("overlandFeatureToColota throws on a non-object", () => {
  assert.throws(() => overlandFeatureToColota(null, undefined))
})

test("overlandFeatureToColota falls back to now when timestamp is missing", () => {
  const before = Math.floor(Date.now() / 1000)
  const r = overlandFeatureToColota(
    { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] }, properties: {} },
    undefined
  )
  assert.ok(r.tst >= before)
})

test("transformPayload owntracks emits _type, cog and default tid", () => {
  const p: ColotaPayload = { lat: 1, lon: 2, acc: 5, batt: 90, bs: 2, tst: 100, bear: 45 }
  const t: Target = { url: "http://x", type: "owntracks" }
  const out = transformPayload(p, t)
  assert.equal(out._type, "location")
  assert.equal(out.cog, 45)
  assert.equal(out.tid, "CL")
})

test("transformPayload traccar GET (OsmAnd) uses id + epoch timestamp", () => {
  const p: ColotaPayload = { lat: 1, lon: 2, acc: 5, batt: 90, bs: 2, tst: 100 }
  const t: Target = { url: "http://x", type: "traccar", tid: "dev1" }
  const out = transformPayload(p, t)
  assert.equal(out.id, "dev1")
  assert.equal(out.lat, 1)
  assert.equal(out.timestamp, 100)
})

test("transformPayload traccar POST nests coords and battery", () => {
  const p: ColotaPayload = { lat: 1, lon: 2, acc: 5, batt: 50, bs: 2, tst: 100 }
  const t: Target = { url: "http://x", type: "traccar", method: "POST", tid: "dev1" }
  const out = transformPayload(p, t) as {
    device_id: string
    location: { coords: Record<string, number>; battery: { level: number; is_charging: boolean } }
  }
  assert.equal(out.device_id, "dev1")
  assert.equal(out.location.coords.latitude, 1)
  assert.equal(out.location.battery.level, 0.5)
  assert.equal(out.location.battery.is_charging, true) // bs 2 = charging
})

test("transformPayload passes through unchanged for geopulse/colota/overland/raw", () => {
  const p: ColotaPayload = { lat: 1, lon: 2, acc: 5, batt: 50, bs: 1, tst: 100 }
  for (const type of ["geopulse", "colota", "overland", "raw"] as const) {
    assert.deepEqual(transformPayload(p, { url: "http://x", type }), { ...p })
  }
})
