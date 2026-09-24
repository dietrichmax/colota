/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { CERT_EXPIRY_WARNING_DAYS } from "../constants"
import type { ClientCertInfoResult } from "../types/global"
import { formatDateWithYear } from "./geo"
import { t } from "../i18n/t"
import type { TranslationKey } from "../i18n/options"

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
  if (info.source === "keychain") return ` · ${t("cert.source.keychain")}`
  if (info.source === "p12") return ` · ${t("cert.source.p12")}`
  return ""
}

/** The words for a stored certificate, shared by the certificate cards and the Connection hub row. */
export function describeCertificate(
  info: ClientCertInfoResult | null,
  now: Date = new Date(),
  failureKey: TranslationKey = "cert.failure.client"
): CertificateState {
  if (!info || !info.configured) {
    return { state: "none", days: 0, word: t("cert.notSet"), caption: "", rowSub: t("cert.notSet") }
  }
  if (info.error || !info.notAfter || !info.subject) {
    const caption = info.error ?? t("cert.missingFields")
    return { state: "unreadable", days: 0, word: t("cert.unreadable"), caption, rowSub: t("cert.unreadable") }
  }
  const days = Math.floor((info.notAfter - now.getTime()) / DAY_MS)
  const until = formatDateWithYear(Math.floor(info.notAfter / 1000))
  if (days < 0) {
    return {
      state: "expired",
      days,
      word: t("cert.expired"),
      caption: t("cert.expiredOn", { date: until, consequence: t(failureKey) }),
      rowSub: t("cert.expired")
    }
  }
  const caption = `${t("cert.until", { date: until })}${source(info)}`
  if (days < CERT_EXPIRY_WARNING_DAYS) {
    const word = t("cert.expiresIn", { count: days, n: days })
    return { state: "expiring", days, word, caption, rowSub: word }
  }
  return { state: "valid", days, word: t("cert.valid"), caption, rowSub: t("cert.validUntil", { date: until }) }
}
