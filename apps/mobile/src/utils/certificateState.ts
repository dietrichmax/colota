/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { CERT_EXPIRY_WARNING_DAYS } from "../constants"
import type { ClientCertInfoResult } from "../types/global"
import { formatDateWithYear } from "./geo"

export type CertificateStateKind = "none" | "valid" | "expiring" | "expired" | "unreadable"

export interface CertificateState {
  state: CertificateStateKind
  /** Whole days until notAfter, negative once past it, 0 when unknown. */
  days: number
  word: string
  caption: string
  /** The Connection hub row's sub. */
  rowSub: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function source(info: { source?: "keychain" | "p12" }): string {
  if (info.source === "keychain") return " · device credential store"
  if (info.source === "p12") return " · imported .p12"
  return ""
}

/** The words for a stored certificate, shared by the certificate cards and the Connection hub row. */
export function describeCertificate(
  info: ClientCertInfoResult | null,
  now: Date = new Date(),
  failureCaption = "the server will refuse it"
): CertificateState {
  if (!info || !info.configured) return { state: "none", days: 0, word: "Not set", caption: "", rowSub: "Not set" }
  if (info.error || !info.notAfter || !info.subject) {
    const caption = info.error ?? "Missing certificate fields"
    return { state: "unreadable", days: 0, word: "Cannot be read", caption, rowSub: "Cannot be read" }
  }
  const days = Math.floor((info.notAfter - now.getTime()) / DAY_MS)
  const until = formatDateWithYear(Math.floor(info.notAfter / 1000))
  if (days < 0) {
    return {
      state: "expired",
      days,
      word: "Expired",
      caption: `Expired ${until} · ${failureCaption}`,
      rowSub: "Expired"
    }
  }
  const caption = `Until ${until}${source(info)}`
  if (days < CERT_EXPIRY_WARNING_DAYS) {
    const word = `Expires in ${days} ${days === 1 ? "day" : "days"}`
    return { state: "expiring", days, word, caption, rowSub: word }
  }
  return { state: "valid", days, word: "Valid", caption, rowSub: `Valid until ${until}` }
}
