export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v)
}

export function hasFiniteNumbers(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => isFiniteNumber(obj[k]))
}

/** Device ids reach outbound headers, so keep them short and printable. */
export function isValidTid(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

/** Host and port of a target URL, for identifying it */
export function targetHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** A Home Assistant webhook id is the URL's only credential. Also run over response bodies, which can echo the path. */
export function maskWebhookId(value: string): string {
  return value.replace(/\/api\/webhook\/[^/?#\s"'<]+/g, "/api/webhook/***")
}

/** Renders a target URL for logs. Keeps host and path, drops credentials, webhook ids and query string. */
export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const creds = parsed.username || parsed.password ? "***@" : ""
    const query = parsed.search ? "?…" : ""
    return `${parsed.protocol}//${creds}${parsed.host}${maskWebhookId(parsed.pathname)}${query}`
  } catch {
    return url
  }
}

export function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n]/g, "")
}
