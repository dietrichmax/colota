/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import NativeLocationService from "../services/NativeLocationService"
import { getLogEntries, type LogLevel } from "./logger"

export interface MergedLogEntry {
  id: string
  time: number
  level: LogLevel | "NATIVE"
  source: "JS" | "NATIVE"
  message: string
  raw: string
}

type ParsedLevel = MergedLogEntry["level"]

/**
 * Recognises both logcat threadtime (`MM-DD HH:MM:SS.mmm PID TID L TAG: msg`)
 * and AppFileLogger output (`yyyy-MM-dd HH:mm:ss.SSS LEVEL/TAG: msg`).
 */
function parseNativeLogLine(raw: string): { time: number; level: ParsedLevel } {
  const fileMatch = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(DEBUG|INFO|WARN|ERROR)\//)
  if (fileMatch) {
    return {
      time: new Date(`${fileMatch[1]}T${fileMatch[2]}`).getTime(),
      level: fileMatch[3] as ParsedLevel
    }
  }

  const logcatMatch = raw.match(/^(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})/)
  const time = logcatMatch ? new Date(`${new Date().getFullYear()}-${logcatMatch[1]}T${logcatMatch[2]}`).getTime() : 0

  const levelMatch = raw.match(/\d+\s+\d+\s+([VDIWEF])\s/)
  const nativeLevel = levelMatch ? levelMatch[1] : ""
  const level: ParsedLevel =
    nativeLevel === "E"
      ? "ERROR"
      : nativeLevel === "W"
        ? "WARN"
        : nativeLevel === "I"
          ? "INFO"
          : nativeLevel === "D"
            ? "DEBUG"
            : "NATIVE"

  return { time, level }
}

/**
 * Merges JS and native log entries chronologically.
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
    for (let i = 0; i < nativeLogs.length; i++) {
      const raw = nativeLogs[i]
      const { time, level } = parseNativeLogLine(raw)
      merged.push({
        id: `native-${i}`,
        time,
        level,
        source: "NATIVE",
        message: raw,
        raw: `[NATIVE] ${raw}`
      })
    }
  } catch {
    // native logs are best-effort
  }

  merged.sort((a, b) => a.time - b.time)
  return merged
}

/**
 * Exports merged logs to a text file and opens the share sheet.
 */
export async function exportLogs(
  buildConfig: { VERSION_NAME: string; VERSION_CODE: number } | null,
  deviceInfo: { systemVersion: string; apiLevel: string | number; brand: string; model: string } | null
): Promise<void> {
  const lines: string[] = ["=== Colota Debug Log Export ===", `Exported: ${new Date().toISOString()}`, ""]

  if (buildConfig) {
    lines.push("--- App Info ---", `Version: ${buildConfig.VERSION_NAME} (${buildConfig.VERSION_CODE})`, "")
  }

  if (deviceInfo) {
    lines.push(
      "--- Device Info ---",
      `OS: Android ${deviceInfo.systemVersion} (API ${deviceInfo.apiLevel})`,
      `Device: ${deviceInfo.brand} ${deviceInfo.model}`,
      ""
    )
  }

  const merged = await getMergedLogs()
  lines.push(`--- Log Entries (${merged.length}) ---`, "")
  for (const entry of merged) {
    lines.push(entry.raw)
  }

  const fileName = `colota_logs_${Date.now()}.txt`
  const filePath = await NativeLocationService.writeFile(fileName, lines.join("\n"))
  await NativeLocationService.shareFile(filePath, "text/plain", "Colota Debug Logs")
}
