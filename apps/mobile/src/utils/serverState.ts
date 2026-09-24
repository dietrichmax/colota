/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatWhen } from "./geo"
import { formatCount } from "./format"
import type { CertificateState } from "./certificateState"
import { t } from "../i18n/t"

export type ServerIcon = "cloudOff" | "cloud" | "wifiOff" | "alert" | "dashed" | "check"
export type ServerTone = "secondary" | "warning" | "error" | "light" | "success"

export interface ServerStateInput {
  offline: boolean
  endpoint: string
  deviceOnline: boolean
  queued: number
  today: number
  /** Epoch milliseconds, 0 when nothing has synced yet. */
  lastSyncTime: number
  lastSyncError: string
  certificate?: CertificateState | null
  now?: Date
}

export interface ServerState {
  icon: ServerIcon
  tone: ServerTone
  word: string
  caption: string
  /** The Settings row and the dock: today's words plus the time. */
  rowSub: string
}

type CountKey = "server.queued" | "server.queuedOnDevice" | "server.savedToday" | "server.today"

function count(n: number, key: CountKey): string {
  return t(key, { count: n, n: formatCount(n) })
}

/** The host of an endpoint for a row label, or the text itself when it is not a URL yet. */
export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

function certificateClause(certificate: CertificateState | null | undefined): string | null {
  if (certificate?.state === "expiring")
    return t("server.cert.expiresIn", { count: certificate.days, n: certificate.days })
  if (certificate?.state === "expired") return t("server.cert.expired")
  return null
}

const clauses = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(" · ")

/** One derivation of the server relationship for the Connection card, the dock and the Settings row. First match wins. */
export function describeServer(input: ServerStateInput): ServerState {
  const now = input.now ?? new Date()
  const queued = count(input.queued, "server.queued")
  const when = input.lastSyncTime > 0 ? formatWhen(Math.floor(input.lastSyncTime / 1000), now) : null
  const lastSync = when ? t("server.lastSync", { when }) : t("server.lastSyncNever")
  const lastSuccess = when ? t("server.lastSuccess", { when }) : t("server.lastSuccessNever")
  const cert = certificateClause(input.certificate)

  if (input.offline) {
    return {
      icon: "cloudOff",
      tone: "secondary",
      word: t("server.word.offline"),
      caption: clauses(count(input.today, "server.savedToday"), t("server.nothingSent")),
      rowSub: clauses(t("server.savedLocally"), count(input.today, "server.today"))
    }
  }
  if (!input.endpoint) {
    return {
      icon: "cloud",
      tone: "warning",
      word: t("server.word.noServer"),
      caption: count(input.queued, "server.queuedOnDevice"),
      rowSub: t("server.noServerConfigured")
    }
  }
  const server = endpointHost(input.endpoint)
  const rowQueue = input.queued > 0 && queued
  if (!input.deviceOnline) {
    return {
      icon: "wifiOff",
      tone: "secondary",
      word: t("server.word.noNetwork"),
      caption: clauses(queued, lastSync, cert),
      rowSub: clauses(server, rowQueue, t("server.noNetworkClause"))
    }
  }
  if (input.lastSyncError !== "") {
    return {
      icon: "alert",
      tone: "error",
      word: t("server.word.failing"),
      caption: clauses(input.lastSyncError, queued, lastSuccess, cert),
      rowSub: clauses(server, rowQueue, t("server.syncFailingClause"))
    }
  }
  if (!when) {
    return {
      icon: "dashed",
      tone: "light",
      word: t("server.word.notSynced"),
      caption: clauses(queued, cert),
      rowSub: clauses(server, rowQueue)
    }
  }
  return {
    icon: "check",
    tone: "success",
    word: t("server.word.synced"),
    caption: clauses(t("server.lastSyncStart", { when }), input.queued > 0 ? queued : t("server.queueEmpty"), cert),
    rowSub: clauses(server, rowQueue, lastSync)
  }
}
