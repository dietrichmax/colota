import express, { Request, Response, NextFunction, Application } from "express"
import crypto from "crypto"
import { loadTargets } from "./targets"
import { forwardToAll, forwardBatch, getDeliveryStats } from "./forwarder"
import { owntracksToColota, overlandFeatureToColota, type ColotaPayload } from "./transform"
import { maskUrl, hasFiniteNumbers, sanitizeLogValue, isValidTid } from "./utils"

export const app: Application = express()
const API_KEY = process.env.API_KEY
const REQUIRE_AUTH = typeof API_KEY === "string" && API_KEY.length > 0

if (API_KEY === "your-secret-key") {
  console.error("API_KEY is still the example value from .env.example - generate one with: openssl rand -base64 32")
  process.exit(1)
}

const targets = loadTargets()
console.log(`Loaded ${targets.length} target(s):`)
targets.forEach((t, i) => console.log(`  ${i + 1}. ${maskUrl(t.url)}${t.auth ? " (auth set)" : ""}`))

if (!API_KEY) {
  console.warn("No API_KEY set - running without authentication")
} else if (API_KEY.length < 16) {
  console.warn("API_KEY is shorter than 16 characters - generate a stronger one with: openssl rand -base64 32")
}

app.set("trust proxy", 1)
app.disable("x-powered-by")

const jsonParser = express.json({ limit: "1mb", strict: true })

const MAX_BATCH_POINTS = Number(process.env.MAX_BATCH_POINTS) || 10_000
const MAX_QUEUED_POINTS = Number(process.env.MAX_QUEUED_POINTS) || 50_000
let queuedPoints = 0

app.use((req: Request, _res: Response, next: NextFunction): void => {
  if (req.path === "/health") return next()
  if (req.method === "GET") return next()
  const url = new URL(req.originalUrl, "http://localhost")
  url.searchParams.delete("api_key")
  const reqLine = sanitizeLogValue(`${req.method} ${url.pathname}${url.search}`)
  console.log(`[${new Date().toISOString()}] ${reqLine} from IP=${sanitizeLogValue(req.ip ?? "")}`)
  next()
})

// Health check. Delivery counts need the key; { status, uptime, targets } stays public.
app.get("/health", (req: Request, res: Response) => {
  const health = { status: "ok", uptime: process.uptime(), targets: targets.length }
  if (!REQUIRE_AUTH || keyMatches(headerKey(req))) {
    res.status(200).json({ ...health, delivery: getDeliveryStats(targets) })
    return
  }
  res.status(200).json(health)
})

function headerKey(req: Request): string | undefined {
  const auth = req.header("authorization")
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined
  return req.header("x-api-key") ?? bearer
}

// POST routes also accept ?api_key= for clients that can't set headers. GET routes must not:
// a key in a GET URL reaches proxy logs, bookmarks and Referer headers.
function providedKey(req: Request): string | undefined {
  return headerKey(req) ?? (typeof req.query.api_key === "string" ? req.query.api_key : undefined)
}

/** True when the request carries the API key, without rejecting when it doesn't. */
function keyMatches(key: string | undefined): boolean {
  if (!key || !API_KEY) return false
  const bufA = Buffer.from(key, "utf8")
  const bufB = Buffer.from(API_KEY, "utf8")
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

// Auth middleware
function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!REQUIRE_AUTH) return next()

  const key = providedKey(req)

  if (!key) {
    res.status(403).json({ error: "Forbidden: missing API key" })
    return
  }

  if (!keyMatches(key)) {
    res.status(403).json({ error: "Forbidden: invalid API key" })
    return
  }

  next()
}

// OwnTracks HTTP receiver — accepts OwnTracks app payloads and forwards to all targets
app.post("/owntracks", authenticate, jsonParser, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>

  if (body._type !== "location") {
    res.status(200).json([])
    return
  }

  if (!hasFiniteNumbers(body, ["lat", "lon", "tst", "acc"])) {
    res.status(400).json({ error: "Missing or invalid required fields: lat, lon, tst, acc" })
    return
  }

  const payload = owntracksToColota(body)
  res.status(200).json([])
  forwardToAll(targets, payload)
})

// Colota HTTP receiver — accepts any JSON payload and fans out to all targets
app.post("/locations", authenticate, jsonParser, async (req: Request, res: Response): Promise<void> => {
  if (!req.is("application/json")) {
    res.status(400).json({ error: "Invalid content type" })
    return
  }

  const body = req.body as Record<string, unknown>
  if (!hasFiniteNumbers(body, ["lat", "lon", "tst", "acc", "batt", "bs"])) {
    res.status(400).json({ error: "Missing or invalid required fields: lat, lon, tst, acc, batt, bs" })
    return
  }

  if (body.tid !== undefined && !isValidTid(body.tid)) {
    res.status(400).json({ error: "Invalid tid: 1-64 characters, no control characters" })
    return
  }

  if (targets.length === 0) {
    res.status(200).json({ message: "No targets configured", forwarded: 0 })
    return
  }

  const payload = body as unknown as ColotaPayload
  const forwarded = targets.filter((t) => !t.filter_tid || payload.tid === t.filter_tid).length

  res.status(200).json({ message: "Accepted", forwarded })
  forwardToAll(targets, payload)
})

app.post("/overland", authenticate, jsonParser, async (req: Request, res: Response): Promise<void> => {
  if (!req.is("application/json")) {
    res.status(400).json({ error: "Invalid content type" })
    return
  }

  const body = req.body as { locations?: unknown; device_id?: unknown }
  if (!Array.isArray(body.locations)) {
    res.status(400).json({ error: "Missing or invalid 'locations' array" })
    return
  }

  if (body.locations.length > MAX_BATCH_POINTS) {
    res
      .status(413)
      .json({ error: `Batch of ${body.locations.length} points exceeds MAX_BATCH_POINTS (${MAX_BATCH_POINTS})` })
    return
  }
  if (queuedPoints + body.locations.length > MAX_QUEUED_POINTS) {
    // 503, not 429: Colota splits a 4xx batch and retries both halves at once; a 5xx makes it back off.
    res.set("Retry-After", "60").status(503).json({ error: "Still forwarding an earlier batch — retry later" })
    return
  }

  if (body.device_id !== undefined && !isValidTid(body.device_id)) {
    res.status(400).json({ error: "Invalid device_id: 1-64 characters, no control characters" })
    return
  }

  const deviceId = isValidTid(body.device_id) ? body.device_id : undefined

  // 201 per Overland spec; fire-and-forget so the client doesn't wait on N target round-trips.
  res.status(201).json({ result: "ok" })

  if (targets.length === 0) return

  const payloads: ColotaPayload[] = []
  let skipped = 0
  for (const feature of body.locations) {
    try {
      payloads.push(overlandFeatureToColota(feature, deviceId))
    } catch (err) {
      skipped++
      console.warn(`[overland] Skipped malformed Feature: ${(err as Error).message}`)
    }
  }
  if (skipped > 0) {
    console.warn(`[overland] ${skipped}/${payloads.length + skipped} Features skipped`)
  }

  queuedPoints += payloads.length
  forwardBatch(targets, { locations: body.locations, device_id: deviceId }, payloads).finally(() => {
    queuedPoints -= payloads.length
  })
})

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Respect upstream status (express.json sets 400 on bad JSON).
  const status =
    (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode ?? 500
  const errUrl = new URL(req.originalUrl, "http://localhost")
  errUrl.searchParams.delete("api_key")
  const reqLine = sanitizeLogValue(`${req.method} ${errUrl.pathname}${errUrl.search}`)
  if (status >= 500) console.error("[ERROR] %s:", reqLine, err)
  else console.warn(`[${status}] ${reqLine}: ${sanitizeLogValue(err.message)}`)
  res.status(status).json({ error: status >= 500 ? "Internal Server Error" : "Bad Request" })
})
