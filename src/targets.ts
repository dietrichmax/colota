export type TargetType = "owntracks" | "geopulse" | "traccar" | "colota" | "overland" | "raw"

const VALID_TYPES: TargetType[] = ["owntracks", "geopulse", "traccar", "colota", "overland", "raw"]

export interface Target {
  url: string
  auth?: string // value for Authorization header, e.g. "Bearer xxx"
  type: TargetType
  method?: "GET" | "POST" // override HTTP method (default: auto per type)
  tid?: string // tracker ID for owntracks type (default: "CL")
  user?: string // X-Limit-U header for owntracks type (default: "colota")
  device?: string // X-Limit-D header for owntracks type (default: "phone")
  filter_tid?: string // only forward to this target when payload tid matches
  batchMode?: "split" | "latest" // how a batch is handled: split into single points (default) or newest point only
  splitConcurrency?: number // max in-flight requests when splitting a batch (non-overland targets)
  splitDelayMs?: number // delay between requests when splitting a batch (non-overland targets)
}

export function loadTargets(): Target[] {
  const targets: Target[] = []
  for (let i = 1; i <= 20; i++) {
    const url = process.env[`TARGET_${i}_URL`]
    if (!url) break
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        console.warn(`TARGET_${i}_URL has unsupported protocol "${parsed.protocol}" — skipping`)
        continue
      }
    } catch {
      console.warn(`TARGET_${i}_URL is not a valid URL — skipping`)
      continue
    }
    const rawType = process.env[`TARGET_${i}_TYPE`] ?? "raw"
    const validType = VALID_TYPES.includes(rawType as TargetType)
    if (!validType) console.warn(`TARGET_${i}_TYPE "${rawType}" is invalid, falling back to "raw"`)
    const type: TargetType = validType ? (rawType as TargetType) : "raw"
    const auth = process.env[`TARGET_${i}_AUTH`]
    const rawMethod = process.env[`TARGET_${i}_METHOD`]?.toUpperCase()
    const method = rawMethod === "GET" || rawMethod === "POST" ? rawMethod : undefined
    const tid = process.env[`TARGET_${i}_TID`]
    const user = process.env[`TARGET_${i}_USER`]
    const device = process.env[`TARGET_${i}_DEVICE`]
    const filter_tid = process.env[`TARGET_${i}_FILTER_TID`]
    const rawBatchMode = process.env[`TARGET_${i}_BATCH_MODE`]?.toLowerCase()
    if (rawBatchMode && rawBatchMode !== "split" && rawBatchMode !== "latest") {
      console.warn(`TARGET_${i}_BATCH_MODE "${rawBatchMode}" is invalid, falling back to "split"`)
    }
    const batchMode = rawBatchMode === "latest" ? "latest" : undefined
    const splitConcurrency = Number(process.env[`TARGET_${i}_SPLIT_CONCURRENCY`]) || undefined
    const splitDelayMs = Number(process.env[`TARGET_${i}_SPLIT_DELAY_MS`]) || undefined
    targets.push({
      url,
      type,
      ...(auth ? { auth } : {}),
      ...(method ? { method } : {}),
      ...(tid ? { tid } : {}),
      ...(user ? { user } : {}),
      ...(device ? { device } : {}),
      ...(filter_tid ? { filter_tid } : {}),
      ...(batchMode ? { batchMode } : {}),
      ...(splitConcurrency ? { splitConcurrency } : {}),
      ...(splitDelayMs ? { splitDelayMs } : {})
    })
  }
  return targets
}
