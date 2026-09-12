/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import NativeLocationService from "../services/NativeLocationService"
import { getLogEntries, MAX_BUFFER_SIZE, type LogLevel } from "./logger"

export interface MergedLogEntry {
  id: string
  time: number
  level: LogLevel
  source: "JS" | "NATIVE"
  message: string
  raw: string
}

/** `AppFileLogger`'s own line shape, which the exported file is written in end to end. */
const FILE_LINE = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(DEBUG|INFO|WARN|ERROR)\/(.*)$/
/** logcat threadtime, the source the reader falls back to while file logging is off. */
const LOGCAT_LINE = /^(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+\d+\s+\d+\s+([VDIWEF])\s+(.*)$/

const LOGCAT_LEVEL: Record<string, LogLevel> = {
  V: "DEBUG",
  D: "DEBUG",
  I: "INFO",
  W: "WARN",
  E: "ERROR",
  F: "ERROR"
}

export interface ParsedNativeLine {
  time: number
  level: LogLevel
  message: string
}

/**
 * Returns null for a line that is neither shape, which is a continuation of the one before it
 * rather than a category of its own. A stack trace is the case that matters: its frames carry no
 * stamp and no level, and giving them a level of their own is what put them outside every filter.
 */
export function parseNativeLogLine(raw: string): ParsedNativeLine | null {
  const fileMatch = raw.match(FILE_LINE)
  if (fileMatch) {
    return {
      time: new Date(`${fileMatch[1]}T${fileMatch[2]}`).getTime(),
      level: fileMatch[3] as LogLevel,
      message: fileMatch[4]
    }
  }

  const logcatMatch = raw.match(LOGCAT_LINE)
  if (logcatMatch) {
    return {
      time: new Date(`${new Date().getFullYear()}-${logcatMatch[1]}T${logcatMatch[2]}`).getTime(),
      level: LOGCAT_LEVEL[logcatMatch[3]] ?? "DEBUG",
      message: logcatMatch[4]
    }
  }

  return null
}

/**
 * Merges the JS ring buffer with whatever the bridge answers, ascending. The screen reverses for
 * display; the ascending order is what the export and `logExport.test.ts` depend on.
 */
export async function getMergedLogs(): Promise<MergedLogEntry[]> {
  const merged: MergedLogEntry[] = []
  const entries = getLogEntries()

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    merged.push({
      id: `js-${i}`,
      time: new Date(entry.timestamp).getTime(),
      level: entry.level,
      source: "JS",
      message: entry.message,
      raw: `[${entry.timestamp}] [JS] ${entry.level} ${entry.message}`
    })
  }

  try {
    const nativeLogs = await NativeLocationService.getNativeLogs()
    // A continuation inherits the line above it, so a stack trace sorts and filters with its throw
    // instead of sinking to epoch zero above every real entry.
    let lastTime = 0
    let lastLevel: LogLevel = "DEBUG"
    for (let i = 0; i < nativeLogs.length; i++) {
      const raw = nativeLogs[i]
      const parsed = parseNativeLogLine(raw)
      if (parsed) {
        lastTime = parsed.time
        lastLevel = parsed.level
      }
      merged.push({
        id: `native-${i}`,
        time: parsed ? parsed.time : lastTime,
        level: parsed ? parsed.level : lastLevel,
        source: "NATIVE",
        message: parsed ? parsed.message : raw,
        raw: `[NATIVE] ${raw}`
      })
    }
  } catch {
    // native logs are best-effort
  }

  merged.sort((a, b) => a.time - b.time)
  return merged
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0")

/** Device local, matching `AppFileLogger`, so the two halves of the exported file compare. */
function localStamp(ms: number): string {
  const d = new Date(ms)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  return `${date} ${time}`
}

/**
 * The block a maintainer reads first. `FLAVOR` is in it because gms against foss is fused location
 * against `LocationManager`, which changes what half the log below can even mean.
 */
export function buildExportHeader(
  buildConfig: { VERSION_NAME: string; VERSION_CODE: number; FLAVOR?: string } | null,
  deviceInfo: { systemVersion: string; apiLevel: string | number; brand: string; model: string } | null,
  startedAtMs: number,
  nowMs: number
): string {
  const lines = ["=== Colota log export ===", `Exported: ${localStamp(nowMs)}`]
  if (buildConfig) {
    const flavor = buildConfig.FLAVOR ? ` ${buildConfig.FLAVOR}` : ""
    lines.push(`App: ${buildConfig.VERSION_NAME} (${buildConfig.VERSION_CODE})${flavor}`)
  }
  if (deviceInfo) {
    lines.push(`Android: ${deviceInfo.systemVersion} (API ${deviceInfo.apiLevel})`)
    lines.push(`Device: ${deviceInfo.brand} ${deviceInfo.model}`)
  }
  if (startedAtMs > 0) lines.push(`Recording started: ${localStamp(startedAtMs)}`)
  return `${lines.join("\n")}\n`
}

export const APP_LOG_COVERAGE = `App log coverage starts here (this session only, last ${MAX_BUFFER_SIZE} lines)`

/**
 * The JS ring buffer in `AppFileLogger`'s exact line shape, so native can interleave it into the
 * recorded file by timestamp rather than bolting it on as a second timeline.
 *
 * The buffer lives for one process while the file spans restarts, so the merge would silently
 * imply the app was quiet before this launch. `APP_LOG_COVERAGE` is emitted at the first JS line
 * to say where the second source starts, which is the one thing a merged stream cannot show by
 * itself.
 */
export function buildAppLog(): string {
  const entries = getLogEntries()
  if (entries.length === 0) return ""
  const lines: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const stamp = localStamp(new Date(entry.timestamp).getTime())
    if (i === 0) lines.push(`${stamp} INFO/${APP_LOG_COVERAGE}`)
    lines.push(`${stamp} ${entry.level}/JS: ${entry.message}`)
  }
  return `${lines.join("\n")}\n`
}
