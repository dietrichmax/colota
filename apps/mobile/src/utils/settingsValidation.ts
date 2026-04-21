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

// Parses a string to a positive integer (>= 1), or returns fallback if invalid.
export function parsePositiveInt(str: string, fallback: number): number {
  const n = parseInt(str, 10)
  return n >= 1 ? n : fallback
}

// Returns true if the string parses to an integer >= 1.
export function isPositiveInt(str: string): boolean {
  return parseInt(str, 10) >= 1
}
