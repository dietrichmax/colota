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

export function isPrivateHost(url: string) {
  try {
    // Strip protocol
    const stripped = url.replace(/^https?:\/\//, "").split(/[/?#]/)[0]
    // Extract host (before any port)
    const host = stripped.split(":")[0]

    // Validate host: must be valid IP or hostname
    const ipRegex =
      /^(127\.0\.0\.1|10\.(\d{1,3}\.){2}\d{1,3}|192\.168\.(\d{1,3}\.)\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.(\d{1,3}\.)\d{1,3})$/
    const hostnameRegex = /^localhost$/

    return ipRegex.test(host) || hostnameRegex.test(host)
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
