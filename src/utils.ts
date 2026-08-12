export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v)
}

export function hasFiniteNumbers(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => isFiniteNumber(obj[k]))
}

/** Renders a target URL for logs. Keeps host and path, drops credentials and query string. */
export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const creds = parsed.username || parsed.password ? "***@" : ""
    const query = parsed.search ? "?…" : ""
    return `${parsed.protocol}//${creds}${parsed.host}${parsed.pathname}${query}`
  } catch {
    return url
  }
}

export function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n]/g, "")
}
