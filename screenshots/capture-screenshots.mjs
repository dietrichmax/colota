import { execFileSync, spawn } from "child_process"
import { createServer } from "http"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import { homedir, tmpdir } from "os"
import { basename, dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ANDROID = join(ROOT, "apps", "mobile", "android")
const APK = join(ANDROID, "app", "build", "outputs", "apk", "gms", "release", "app-gms-x86_64-release.apk")
const SCREENSHOTS = join(ROOT, "screenshots")
const OUT = join(ROOT, "apps", "docs", "static", "img", "screenshots")
const FLOW = join(SCREENSHOTS, "capture.yaml")
const GPX = join(SCREENSHOTS, "demo-track.gpx")
const SDK = process.env.ANDROID_HOME ?? join(homedir(), "Android", "Sdk")
const AVD = "colota_a14"
const MAESTRO = join(homedir(), ".maestro", "bin", "maestro")
const APP_ID = "com.Colota"
const STAND_IN_PORT = 8080
const DEMO_FILE = "colota-demo-timeline.json"
const AREA_NAME = "Dolomites"
const HOME = { lat: 46.686707, lon: 11.64823 }
const PERMISSIONS = [
  "ACCESS_FINE_LOCATION",
  "ACCESS_COARSE_LOCATION",
  "ACCESS_BACKGROUND_LOCATION",
  "POST_NOTIFICATIONS"
]
// Where the old evenly thinned track put the Dashboard stretch; keeps the framing the store images use.
const TRAVEL_FROM = Date.parse("2022-07-12T08:07:10Z")
const TRAVEL_METERS = 2000
const TRIP_GAP_MS = 15 * 60 * 1000
const DEMO_ACCURACY_M = 5
const TRIP_MAP = {
  top: 422,
  width: 1080,
  height: 1200,
  density: 2.625,
  padding: { top: 16, right: 72, bottom: 32, left: 16 }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts })
const runAsync = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) =>
    spawn(cmd, args, { stdio: "inherit", ...opts }).on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${basename(cmd)} exited with code ${code}`))
    )
  )
let serial = null
const adb = (...args) => execFileSync("adb", [...(serial ? ["-s", serial] : []), ...args], { encoding: "utf8" })
const demo = (...extras) =>
  adb("shell", "am", "broadcast", "-a", "com.android.systemui.demo", "-e", "command", ...extras)

function distance(a, b) {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

function readTrack() {
  const xml = readFileSync(GPX, "utf8")
  const points = [...xml.matchAll(/<trkpt lat="([\d.-]+)" lon="([\d.-]+)">([\s\S]*?)<\/trkpt>/g)].map(
    ([, lat, lon, body]) => ({
      lat: Number(lat),
      lon: Number(lon),
      ele: Number(body.match(/<ele>([^<]+)/)?.[1]),
      time: Date.parse(body.match(/<time>([^<]+)/)?.[1])
    })
  )
  if (points.length < 2 || points.some((p) => Number.isNaN(p.time))) {
    throw new Error(`${GPX} needs a track with a <time> on every point`)
  }
  return points
}

function findEmulator() {
  const line = adb("devices")
    .split("\n")
    .find((l) => /^emulator-\d+\s+device/.test(l))
  return line ? line.split(/\s+/)[0] : null
}

function ensureEmulator() {
  serial = findEmulator()
  const started = !serial
  if (started) {
    console.log(`Starting emulator ${AVD}`)
    spawn(join(SDK, "emulator", "emulator"), ["-avd", AVD, "-no-snapshot-save", "-no-boot-anim"], {
      detached: true,
      stdio: "ignore"
    }).unref()
    while (!(serial = findEmulator())) sleep(2000)
  }
  adb("wait-for-device")
  while (adb("shell", "getprop", "sys.boot_completed").trim() !== "1") sleep(2000)
  return started
}

function installFresh() {
  try {
    adb("uninstall", APP_ID)
  } catch {}
  run("adb", ["-s", serial, "install", APK])
  for (const permission of PERMISSIONS) adb("shell", "pm", "grant", APP_ID, `android.permission.${permission}`)
  adb("shell", "dumpsys", "deviceidle", "whitelist", `+${APP_ID}`)
}

function prepareDevice() {
  adb("emu", "power", "ac", "off")
  adb("emu", "power", "status", "discharging")
  adb("emu", "power", "capacity", "90")
  adb("shell", "settings", "put", "global", "sysui_demo_allowed", "1")
  demo("enter")
  demo("clock", "-e", "hhmm", "0941")
  demo("battery", "-e", "level", "100", "-e", "plugged", "false")
  demo("network", "-e", "wifi", "show", "-e", "level", "4", "-e", "fully", "true")
  demo("notifications", "-e", "visible", "false")
}

function restoreDevice() {
  demo("exit")
  adb("emu", "power", "ac", "on")
  adb("emu", "power", "status", "charging")
}

function demoTimeline(track) {
  const [year, month, day] = adb("shell", "date", "+%F").trim().split("-").map(Number)
  const offset = adb("shell", "date", "+%z")
    .trim()
    .replace(/(\d\d)$/, ":$1")
  const offsetMs =
    (offset.startsWith("-") ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) * 60000
  const localMidnight = (ms) => Date.parse(new Date(ms + offsetMs).toISOString().slice(0, 10))
  const shift = Date.UTC(year, month - 1, day - 1) - localMidnight(track[0].time)
  const iso = (ms) => new Date(ms + offsetMs).toISOString().replace("Z", offset)

  const rawSignals = track.map((p, i) => {
    const prev = track[i - 1]
    const seconds = prev ? (p.time - prev.time) / 1000 : 0
    return {
      position: {
        LatLng: `${p.lat.toFixed(6)}°, ${p.lon.toFixed(6)}°`,
        timestamp: iso(p.time + shift),
        accuracyMeters: DEMO_ACCURACY_M,
        altitudeMeters: Math.round(p.ele),
        speedMetersPerSecond: seconds > 0 ? Math.round(distance(prev, p) / seconds) : 0
      }
    }
  })
  return { rawSignals }
}

function travelPoints(track) {
  const from = track.findIndex((p) => p.time >= TRAVEL_FROM)
  const window = [track[from]]
  let meters = 0
  for (let i = from + 1; i < track.length && meters < TRAVEL_METERS; i++) {
    meters += distance(track[i - 1], track[i])
    window.push(track[i])
  }
  return window
}

// Maestro's travel ignores its speed, so each point waits out one Driving interval and becomes one fix.
const DRIVE_STEP_MS = 4500

function drive(points) {
  return points
    .map(
      (p) =>
        `- setLocation:\n    latitude: ${p.lat}\n    longitude: ${p.lon}\n` +
        `- extendedWaitUntil:\n    visible: "capture-pause-never-shown"\n    timeout: ${DRIVE_STEP_MS}\n    optional: true`
    )
    .join("\n")
}

function splitPoint(track) {
  const gap = track.findIndex((p, i) => i > 0 && p.time - track[i - 1].time >= TRIP_GAP_MS)
  const trip = track.slice(0, gap === -1 ? track.length : gap)
  const mercX = (p) => (p.lon + 180) / 360
  const mercY = (p) => {
    const rad = (p.lat * Math.PI) / 180
    return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
  }
  const xs = trip.map(mercX)
  const ys = trip.map(mercY)
  const { top, width, height, density, padding } = TRIP_MAP
  const innerW = width - (padding.left + padding.right) * density
  const innerH = height - (padding.top + padding.bottom) * density
  const scale = Math.min(innerW / (Math.max(...xs) - Math.min(...xs)), innerH / (Math.max(...ys) - Math.min(...ys)))
  const target = trip[Math.floor(trip.length / 2)]
  const x = padding.left * density + innerW / 2 + (mercX(target) - (Math.max(...xs) + Math.min(...xs)) / 2) * scale
  const y = top + padding.top * density + innerH / 2 + (mercY(target) - (Math.max(...ys) + Math.min(...ys)) / 2) * scale
  return `${Math.round(x)},${Math.round(y)}`
}

async function startStandIn() {
  const server = createServer((req, res) => {
    req.resume()
    req.on("end", () => res.writeHead(200).end())
  })
  await new Promise((resolve, reject) => server.once("error", reject).listen(STAND_IN_PORT, "127.0.0.1", resolve))
  adb("reverse", `tcp:${STAND_IN_PORT}`, `tcp:${STAND_IN_PORT}`)
  return server
}

function collectScreenshots(dir) {
  if (!existsSync(dir)) return
  mkdirSync(OUT, { recursive: true })
  for (const file of readdirSync(dir, { recursive: true })) {
    if (!file.endsWith(".png") || basename(dirname(file)) !== "takeScreenshot") continue
    copyFileSync(join(dir, file), join(OUT, basename(file)))
    console.log(`${basename(file)} -> ${OUT}`)
  }
}

if (!existsSync(MAESTRO)) {
  console.error(`Maestro not found at ${MAESTRO}. Install it: curl -Ls "https://get.maestro.mobile.dev" | bash`)
  process.exit(1)
}

const track = readTrack()
const setup = {
  endpoint: `http://localhost:${STAND_IN_PORT}/`,
  geofences: [{ name: "Home", ...HOME, radius: 150, pauseTracking: true }],
  profiles: [
    {
      name: "Driving",
      interval: 4,
      distance: 10,
      syncInterval: 600,
      priority: 30,
      condition: { type: "speed_above", speedThreshold: 8.3 }
    },
    { name: "Charging", interval: 5, distance: 0, syncInterval: 600, priority: 20, condition: { type: "charging" } },
    {
      name: "Stationary",
      interval: 300,
      distance: 0,
      syncInterval: 900,
      priority: 10,
      condition: { type: "stationary" }
    }
  ]
}
const travel = travelPoints(track)

run("./gradlew", ["assembleGmsRelease", "-PreactNativeArchitectures=x86_64"], { cwd: ANDROID })
const startedEmulator = ensureEmulator()
installFresh()
prepareDevice()

const work = mkdtempSync(join(tmpdir(), "colota-capture-"))
writeFileSync(join(work, DEMO_FILE), JSON.stringify(demoTimeline(track)))
adb("push", join(work, DEMO_FILE), `/sdcard/Download/${DEMO_FILE}`)
const setupLink = `colota://setup?config=${encodeURIComponent(Buffer.from(JSON.stringify(setup)).toString("base64"))}`
const env = {
  SETUP_LINK: setupLink,
  AREA_NAME,
  START_LAT: travel[0].lat,
  START_LON: travel[0].lon,
  SPLIT_POINT: splitPoint(track),
  DRIVE: drive(travel)
}
const flow = readFileSync(FLOW, "utf8").replace(/\$\{(\w+)\}/g, (_, key) => {
  if (!(key in env)) throw new Error(`capture.yaml uses \${${key}}, which the script does not set`)
  return String(env[key])
})
writeFileSync(join(work, "capture.yaml"), flow)
const server = await startStandIn()

try {
  // A sync spawn blocks the event loop, so the stand-in server would never answer the app.
  await runAsync(
    MAESTRO,
    ["--device", serial, "test", "--test-output-dir", join(work, "maestro"), join(work, "capture.yaml")],
    {
      env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: "1", MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true" }
    }
  )
} finally {
  server.close()
  adb("reverse", "--remove", `tcp:${STAND_IN_PORT}`)
  restoreDevice()
  if (startedEmulator) adb("emu", "kill")
}
collectScreenshots(join(work, "maestro"))
rmSync(work, { recursive: true, force: true })

run("node", [
  "--no-warnings=MODULE_TYPELESS_PACKAGE_JSON",
  join(SCREENSHOTS, "render-store-screenshots.mjs"),
  ...process.argv.slice(2)
])
