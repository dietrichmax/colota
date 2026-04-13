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

// Validates that a URL has a valid http(s):// scheme and hostname.
export function isEndpointAllowed(url: string) {
  return /^https?:\/\/[^/:]+/.test(url)
}
