/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { API_TEMPLATES, type ApiTemplateName, type DawarichMode } from "../types/global"

export const CUSTOM_ENDPOINT_EXAMPLE = "https://your-server.example/api"

/** The endpoint shape the chosen template expects, for the field's placeholder and helper. */
export function endpointExample(template: ApiTemplateName, dawarichMode: DawarichMode = "single"): string {
  if (template === "custom") return CUSTOM_ENDPOINT_EXAMPLE
  const entry = API_TEMPLATES[template]
  if (template === "dawarich" && dawarichMode === "batch" && entry.batchEndpointExample)
    return entry.batchEndpointExample
  return entry.endpointExample
}

const KEY_QUERY_PARAMS = ["api_key", "apikey", "token", "access_token", "secret", "password", "auth"]

/** True when the address carries a credential in its query string, which settings store in the clear. */
export function endpointCarriesKey(url: string): boolean {
  const query = url.split("#")[0].split("?")[1]
  if (!query) return false
  return query.split("&").some((pair) => KEY_QUERY_PARAMS.includes(pair.split("=")[0].toLowerCase()))
}

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

/** The digits of a whole number, or null: decimals, signs, exponents and the empty string never reach a setting. */
export function parseWholeNumber(text: string): number | null {
  return /^\d+$/.test(text) ? Number(text) : null
}

/** The error a numeric field shows while its text is non-empty and would not be stored. */
export function wholeNumberError(text: string, min: number, unit: string): string | undefined {
  if (text === "") return undefined
  const value = parseWholeNumber(text)
  if (value === null) return "A whole number"
  if (value < min) return `At least ${min} ${unit}`
  return undefined
}
