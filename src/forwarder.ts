import type { Target } from "./targets"
import { transformPayload, type ColotaPayload } from "./transform"
import { maskUrl } from "./utils"

const FORWARD_TIMEOUT = Number(process.env.FORWARD_TIMEOUT_MS) || 30_000

export async function forwardToAll(targets: Target[], payload: ColotaPayload): Promise<void> {
  const filtered = targets.filter((t) => !t.filter_tid || payload.tid === t.filter_tid)
  await Promise.allSettled(
    filtered.map(async (target) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT)
      try {
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
          const params = new URLSearchParams(
            Object.entries(transformed).map(([k, v]) => [k, String(v)])
          )
          url = `${target.url}?${params}`
        }

        const res = await fetch(url, {
          method: isGet ? "GET" : "POST",
          headers,
          ...(isGet ? {} : { body: JSON.stringify(transformed) }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const text = (await res.text()).slice(0, 200)
          console.warn(`[forwarder] ${maskUrl(target.url)} responded ${res.status}: ${text}`)
        }
      } catch (err) {
        console.error(`[forwarder] Failed to reach ${maskUrl(target.url)}:`, err)
      } finally {
        clearTimeout(timeout)
      }
    })
  )
}
