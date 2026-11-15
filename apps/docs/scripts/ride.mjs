/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// Writes data/ride.json for the landing page from screenshots/demo-track.gpx, the ride in the app's screenshots:
// one path per trip, split like the app's History tab, plus the numbers its dock prints.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Mirrors DEFAULT_GAP_SECONDS and MIN_TRIP_EXTENT_METERS in apps/mobile/src/utils/trips.ts.
const GAP_SECONDS = 900
const MIN_TRIP_EXTENT_METERS = 100
// Where the demo ride was recorded, so the trip times read as the app showed them.
const TIME_ZONE = "Europe/Rome"
const WIDTH = 1000
const POINTS_PER_TRIP = 160

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const gpx = readFileSync(join(docsRoot, "..", "..", "screenshots", "demo-track.gpx"), "utf8")
const points = [...gpx.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)">[\s\S]*?<time>([^<]+)<\/time>/g)].map((m) => ({
  lat: Number(m[1]),
  lon: Number(m[2]),
  time: Date.parse(m[3])
}))
if (points.length < 2) throw new Error("screenshots/demo-track.gpx has no track points")

const rad = (deg) => (deg * Math.PI) / 180
const meters = (a, b) => {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

const runs = [[points[0]]]
for (let i = 1; i < points.length; i++) {
  if ((points[i].time - points[i - 1].time) / 1000 >= GAP_SECONDS) runs.push([])
  runs.at(-1).push(points[i])
}
const extent = (run) => {
  const lats = run.map((p) => p.lat)
  const lons = run.map((p) => p.lon)
  return meters({ lat: Math.min(...lats), lon: Math.min(...lons) }, { lat: Math.max(...lats), lon: Math.max(...lons) })
}
const trips = runs.filter((run) => extent(run) >= MIN_TRIP_EXTENT_METERS)

const all = trips.flat()
const k = Math.cos(rad(all.reduce((sum, p) => sum + p.lat, 0) / all.length))
const xs = all.map((p) => p.lon * k)
const ys = all.map((p) => -p.lat)
const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
const scale = WIDTH / (maxX - minX)
const project = (p) => [+((p.lon * k - minX) * scale).toFixed(1), +((-p.lat - minY) * scale).toFixed(1)]

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE })
let distance = 0
const out = trips.map((trip, i) => {
  for (let j = 1; j < trip.length; j++) distance += meters(trip[j - 1], trip[j])
  const step = Math.max(1, Math.floor(trip.length / POINTS_PER_TRIP))
  const kept = trip.filter((_, j) => j % step === 0 || j === trip.length - 1).map(project)
  return {
    color: (i % 6) + 1,
    d: "M" + kept.map(([x, y]) => `${x},${y}`).join("L"),
    start: kept[0],
    end: kept.at(-1),
    time: clock.format(trip[0].time)
  }
})

const ride = {
  width: WIDTH,
  height: +((maxY - minY) * scale).toFixed(1),
  trips: out,
  points: all.length,
  km: (distance / 1000).toFixed(1),
  from: clock.format(trips[0][0].time),
  to: clock.format(trips.at(-1).at(-1).time)
}
mkdirSync(join(docsRoot, "data"), { recursive: true })
writeFileSync(join(docsRoot, "data", "ride.json"), JSON.stringify(ride) + "\n")
