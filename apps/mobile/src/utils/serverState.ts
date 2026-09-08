/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatWhen } from "./geo"
import { formatCount } from "./format"
import type { CertificateState } from "./certificateState"

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

function count(n: number, noun: string): string {
  return `${formatCount(n)} ${noun}`
}

/** The host of an endpoint for a row label, or the text itself when it is not a URL yet. */
export function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return endpoint
  }
}

function certificateClause(certificate: CertificateState | null | undefined): string {
  if (certificate?.state === "expiring")
    return ` · client certificate expires in ${certificate.days} ${certificate.days === 1 ? "day" : "days"}`
  if (certificate?.state === "expired") return " · client certificate expired"
  return ""
}

/** One derivation of the server relationship for the Connection card, the dock and the Settings row. First match wins. */
export function describeServer(input: ServerStateInput): ServerState {
  const now = input.now ?? new Date()
  const queued = count(input.queued, "queued")
  const lastSync = input.lastSyncTime > 0 ? formatWhen(Math.floor(input.lastSyncTime / 1000), now) : "never"
  const cert = certificateClause(input.certificate)

  if (input.offline) {
    return {
      icon: "cloudOff",
      tone: "secondary",
      word: "Offline mode",
      caption: `${count(input.today, "saved today")} · nothing is sent`,
      rowSub: `Offline - saved locally · ${count(input.today, "today")}`
    }
  }
  if (!input.endpoint) {
    return {
      icon: "cloud",
      tone: "warning",
      word: "No server",
      caption: `${queued} on this device`,
      rowSub: "No server configured"
    }
  }
  const server = endpointHost(input.endpoint)
  const rowQueue = input.queued > 0 ? ` · ${queued}` : ""
  if (!input.deviceOnline) {
    return {
      icon: "wifiOff",
      tone: "secondary",
      word: "No network",
      caption: `${queued} · last sync ${lastSync}${cert}`,
      rowSub: `${server}${rowQueue} · no network`
    }
  }
  if (input.lastSyncError !== "") {
    return {
      icon: "alert",
      tone: "error",
      word: "Sync failing",
      caption: `${input.lastSyncError} · ${queued} · last success ${lastSync}${cert}`,
      rowSub: `${server}${rowQueue} · sync failing`
    }
  }
  if (input.lastSyncTime === 0) {
    return {
      icon: "dashed",
      tone: "light",
      word: "Not synced yet",
      caption: `${queued}${cert}`,
      rowSub: `${server}${rowQueue}`
    }
  }
  return {
    icon: "check",
    tone: "success",
    word: "Synced",
    caption: `Last sync ${lastSync} · ${input.queued > 0 ? queued : "queue empty"}${cert}`,
    rowSub: `${server}${rowQueue} · last sync ${lastSync}`
  }
}
