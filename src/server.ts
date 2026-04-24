import express, { Request, Response, NextFunction, Application } from "express"
import crypto from "crypto"
import { loadTargets } from "./targets"
import { forwardToAll } from "./forwarder"
import { owntracksToColota, type ColotaPayload } from "./transform"
import { maskUrl } from "./utils"
import "dotenv/config"

const app: Application = express()
const PORT = Number(process.env.PORT) || 3000
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

  const { lat, lon, tst, acc } = body
  if (
    typeof lat !== "number" ||
    !isFinite(lat) ||
    typeof lon !== "number" ||
    !isFinite(lon) ||
    typeof tst !== "number" ||
    !isFinite(tst) ||
    typeof acc !== "number" ||
    !isFinite(acc)
  ) {
    res.status(400).json({ error: "Missing or invalid required fields: lat, lon, tst, acc" })
    return
  }

  const payload = owntracksToColota(body)
  res.status(200).json([])
  forwardToAll(targets, payload)
})

// HEAD /locations - used by mobile app health checks
app.head("/locations", (_req: Request, res: Response) => {
  res.sendStatus(200)
})

// Colota HTTP receiver — accepts any JSON payload and fans out to all targets
app.post("/locations", authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!req.is("application/json")) {
    res.status(400).json({ error: "Invalid content type" })
    return
  }

  const body = req.body as Record<string, unknown>
  if (
    typeof body.lat !== "number" ||
    !isFinite(body.lat) ||
    typeof body.lon !== "number" ||
    !isFinite(body.lon) ||
    typeof body.tst !== "number" ||
    !isFinite(body.tst) ||
    typeof body.acc !== "number" ||
    !isFinite(body.acc) ||
    typeof body.batt !== "number" ||
    !isFinite(body.batt) ||
    typeof body.bs !== "number" ||
    !isFinite(body.bs)
  ) {
    res.status(400).json({ error: "Missing or invalid required fields: lat, lon, tst, acc, batt, bs" })
    return
  }

  if (targets.length === 0) {
    res.status(200).json({ message: "No targets configured", forwarded: 0 })
    return
  }

  const payload = body as unknown as ColotaPayload
  const forwarded = targets.filter((t) => !t.filter_tid || payload.tid === t.filter_tid).length

  // Fire-and-forget: respond immediately, forward in background
  res.status(200).json({ message: "Accepted", forwarded })
  forwardToAll(targets, payload)
})

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const errUrl = new URL(req.originalUrl, "http://localhost")
  errUrl.searchParams.delete("api_key")
  console.error(`[ERROR] ${req.method} ${errUrl.pathname}${errUrl.search}:`, err)
  res.status(500).json({ error: "Internal Server Error" })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toISOString()}`)
})
