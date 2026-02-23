/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

/**
 * Returns the set of strings that appear more than once in the input.
 */
export function findDuplicates(values: string[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const v of values) {
    if (seen.has(v)) dupes.add(v)
    seen.add(v)
  }
  return dupes
}

function isPrivateIP(host: string): boolean {
  const parts = host.split(".")
  if (parts.length !== 4) return false
  const octets = parts.map(Number)
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return false
  const [a, b] = octets
  return (
    a === 127 || // Loopback (127.0.0.0/8)
    a === 10 || // RFC 1918 (10.0.0.0/8)
    (a === 192 && b === 168) || // RFC 1918 (192.168.0.0/16)
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918 (172.16.0.0/12)
    (a === 100 && b >= 64 && b <= 127) || // CGNAT (100.64.0.0/10)
    (a === 169 && b === 254) // Link-local (169.254.0.0/16)
  )
}

export function isPrivateHost(url: string) {
  try {
    const stripped = url.replace(/^https?:\/\//, "").split(/[/?#]/)[0]
    const host = stripped.split(":")[0]
    return isPrivateIP(host) || host === "localhost"
  } catch {
    return false
  }
}

export function isEndpointAllowed(url: string) {
  if (!url) return false

  const match = url.match(/^(https?):\/\/([^/:]+)(:\d+)?/)
  if (!match) return false

  const protocol = match[1] // http or https
  const host = match[2]

  if (protocol === "https") return true
  if (protocol === "http" && isPrivateHost(host)) return true

  return false
}
