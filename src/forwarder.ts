import type { Target } from "./targets"
import { transformPayload, type ColotaPayload } from "./transform"
import { maskUrl, sanitizeLogValue, targetHost } from "./utils"

const FORWARD_TIMEOUT = Number(process.env.FORWARD_TIMEOUT_MS) || 30_000
const DEFAULT_SPLIT_CONCURRENCY = Number(process.env.SPLIT_CONCURRENCY) || 1
const DEFAULT_SPLIT_DELAY_MS = Number(process.env.SPLIT_DELAY_MS) || 0

export interface OverlandEnvelope {
  locations: unknown[]
  device_id?: string
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface TargetStats {
  target: number // the n in TARGET_n
  host: string // host:port only — this is exposed over /health
  ok: number
  failed: number
  lastOkAt?: string
  lastFailAt?: string
  lastError?: string
}

const stats = new Map<string, Omit<TargetStats, "target" | "host">>()

function record(target: Target, error?: string): void {
  let s = stats.get(target.url)
  if (!s) {
    s = { ok: 0, failed: 0 }
    stats.set(target.url, s)
  }
  const now = new Date().toISOString()
  if (error === undefined) {
    s.ok++
    s.lastOkAt = now
  } else {
    s.failed++
    s.lastFailAt = now
    s.lastError = error
  }
}

/** Delivery counters per configured target, in config order. */
export function getDeliveryStats(targets: Target[]): TargetStats[] {
  return targets.map((t, i) => {
    const s = stats.get(t.url) ?? { ok: 0, failed: 0 }
    return { target: i + 1, host: targetHost(t.url), ...s }
  })
}

async function dispatch(target: Target, url: string, init: RequestInit): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200)
      console.warn(`[forwarder] ${maskUrl(target.url)} responded ${res.status}: ${text}`)
      record(target, `HTTP ${res.status}`)
    } else {
      record(target)
    }
  } catch (err) {
    console.error(`[forwarder] Failed to reach ${maskUrl(target.url)}:`, err)
    record(target, sanitizeLogValue(String(err)).slice(0, 120))
  } finally {
    clearTimeout(timeout)
  }
}

/** Sends one transformed point to a target. */
async function sendToTarget(target: Target, payload: ColotaPayload): Promise<void> {
  const defaultGet = target.type === "traccar"
  const isGet = target.method ? target.method === "GET" : defaultGet
  const transformed = transformPayload(payload, target)
  const headers: Record<string, string> = {}
  if (!isGet) headers["Content-Type"] = "application/json"
  if (target.auth) headers["Authorization"] = target.auth
  if (target.type === "owntracks") {
    headers["X-Limit-U"] = target.user ?? "colota"
    headers["X-Limit-D"] = payload.tid ?? target.device ?? "phone"
  }

  let url = target.url
  if (isGet) {
    const parsed = new URL(target.url)
    for (const [k, v] of Object.entries(transformed)) parsed.searchParams.set(k, String(v))
    url = parsed.toString()
  }

  await dispatch(target, url, {
    method: isGet ? "GET" : "POST",
    headers,
    ...(isGet ? {} : { body: JSON.stringify(transformed) })
  })
}

/** POSTs the raw batch to an `overland` target. */
async function sendEnvelopeToTarget(target: Target, envelope: OverlandEnvelope): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (target.auth) headers["Authorization"] = target.auth
  await dispatch(target, target.url, { method: "POST", headers, body: JSON.stringify(envelope) })
}

/** Sends a batch as single requests to one target, capped by concurrency + delay. */
async function splitToTarget(target: Target, payloads: ColotaPayload[]): Promise<void> {
  const concurrency = Math.max(1, target.splitConcurrency ?? DEFAULT_SPLIT_CONCURRENCY)
  const delayMs = Math.max(0, target.splitDelayMs ?? DEFAULT_SPLIT_DELAY_MS)

  let index = 0
  const worker = async (): Promise<void> => {
    while (index < payloads.length) {
      const payload = payloads[index++]
      await sendToTarget(target, payload)
      if (delayMs > 0 && index < payloads.length) await sleep(delayMs)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, payloads.length) }, worker)
  await Promise.all(workers)
}

export async function forwardToAll(targets: Target[], payload: ColotaPayload): Promise<void> {
  const filtered = targets.filter((t) => !t.filter_tid || payload.tid === t.filter_tid)
  await Promise.allSettled(filtered.map((target) => sendToTarget(target, payload)))
}

/** Fans an Overland batch out by target: */
export async function forwardBatch(
  targets: Target[],
  envelope: OverlandEnvelope,
  payloads: ColotaPayload[]
): Promise<void> {
  const deviceId = envelope.device_id
  const matching = targets.filter((t) => !t.filter_tid || deviceId === t.filter_tid)
  const latest = payloads.length > 0 ? payloads.reduce((a, b) => (b.tst > a.tst ? b : a)) : undefined
  await Promise.allSettled(
    matching.map((target) => {
      if (target.type === "overland") return sendEnvelopeToTarget(target, envelope)
      if (target.batchMode === "latest") return latest ? sendToTarget(target, latest) : Promise.resolve()
      return splitToTarget(target, payloads)
    })
  )
}
