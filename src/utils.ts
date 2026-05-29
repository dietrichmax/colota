export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v)
}

export function hasFiniteNumbers(obj: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => isFiniteNumber(obj[k]))
}

const SENSITIVE_PARAMS = new Set(["api_key", "token"])

export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url)
    for (const param of SENSITIVE_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, "***")
      }
    }
    return parsed.toString()
  } catch {
    return url
  }
}
