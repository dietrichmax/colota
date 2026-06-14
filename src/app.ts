import express, { Request, Response, NextFunction, Application } from "express"
import crypto from "crypto"
import { loadTargets } from "./targets"
import { forwardToAll, forwardBatch } from "./forwarder"
import { owntracksToColota, overlandFeatureToColota, type ColotaPayload } from "./transform"
import { maskUrl, hasFiniteNumbers } from "./utils"

export const app: Application = express()
const API_KEY = process.env.API_KEY
const REQUIRE_AUTH = typeof API_KEY === "string" && API_KEY.length > 0

const targets = loadTargets()
console.log(`Loaded ${targets.length} target(s):`)
targets.forEach((t, i) => console.log(`  ${i + 1}. ${maskUrl(t.url)}${t.auth ? " (auth set)" : ""}`))

if (!REQUIRE_AUTH) {
  console.warn("No API_KEY set - running without authentication")
}

app.set("trust proxy", 1)
app.disable("x-powered-by")

app.use(express.json({ limit: "1mb", strict: true }))

app.use((req: Request, _res: Response, next: NextFunction): void => {
  if (req.path === "/health") return next()
  if (req.method === "GET") return next()
  const url = new URL(req.originalUrl, "http://localhost")
  url.searchParams.delete("api_key")
  console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}${url.search} from IP=${req.ip}`)
  next()
})

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", uptime: process.uptime(), targets: targets.length })
})

// Auth middleware
function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (!REQUIRE_AUTH) return next()

  const bearer = req.header("authorization")?.startsWith("Bearer ") ? req.header("authorization")!.slice(7) : undefined
  const key =
    req.header("x-api-key") ?? bearer ?? (typeof req.query.api_key === "string" ? req.query.api_key : undefined)

  if (!key || !API_KEY) {
    res.status(403).json({ error: "Forbidden: missing API key" })
    return
  }

  const bufA = Buffer.from(key, "utf8")
  const bufB = Buffer.from(API_KEY, "utf8")
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    res.status(403).json({ error: "Forbidden: invalid API key" })
    return
  }

  next()
}

// OwnTracks HTTP receiver — accepts OwnTracks app payloads and forwards to all targets
app.post("/owntracks", authenticate, async (req: Request, res: Response): Promise<void> => {
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
app.post("/locations", authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!req.is("application/json")) {
    res.status(400).json({ error: "Invalid content type" })
    return
  }

  const body = req.body as Record<string, unknown>
  if (!hasFiniteNumbers(body, ["lat", "lon", "tst", "acc", "batt", "bs"])) {
    res.status(400).json({ error: "Missing or invalid required fields: lat, lon, tst, acc, batt, bs" })
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

app.post("/overland", authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!req.is("application/json")) {
    res.status(400).json({ error: "Invalid content type" })
    return
  }

  const body = req.body as { locations?: unknown; device_id?: unknown }
  if (!Array.isArray(body.locations)) {
    res.status(400).json({ error: "Missing or invalid 'locations' array" })
    return
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id : undefined

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
    console.warn(`[overland] ${skipped}/${body.locations.length} Features skipped`)
  }

  forwardBatch(targets, { locations: body.locations, device_id: deviceId }, payloads)
})

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Respect upstream status (express.json sets 400 on bad JSON).
  const status =
    (err as { status?: number; statusCode?: number }).status ?? (err as { statusCode?: number }).statusCode ?? 500
  const errUrl = new URL(req.originalUrl, "http://localhost")
  errUrl.searchParams.delete("api_key")
  if (status >= 500) console.error("[ERROR] %s %s%s:", req.method, errUrl.pathname, errUrl.search, err)
  else console.warn(`[${status}] ${req.method} ${errUrl.pathname}${errUrl.search}: ${err.message}`)
  res.status(status).json({ error: status >= 500 ? "Internal Server Error" : "Bad Request" })
})
