/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import NativeLocationService from "../services/NativeLocationService"
import { getLogEntries } from "./logger"

export interface MergedLogEntry {
  id: string
  time: number
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "NATIVE"
  source: "JS" | "NATIVE"
  message: string
  raw: string
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
    const year = new Date().getFullYear()
    for (let i = 0; i < nativeLogs.length; i++) {
      const raw = nativeLogs[i]
      const match = raw.match(/^(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})/)
      const time = match ? new Date(`${year}-${match[1]}T${match[2]}`).getTime() : 0

      // Extract level from logcat threadtime format: "MM-DD HH:MM:SS.mmm PID TID L TAG: msg"
      const levelMatch = raw.match(/\d+\s+\d+\s+([VDIWEF])\s/)
      const nativeLevel = levelMatch ? levelMatch[1] : ""
      const level =
        nativeLevel === "E"
          ? "ERROR"
          : nativeLevel === "W"
            ? "WARN"
            : nativeLevel === "I"
              ? "INFO"
              : nativeLevel === "D"
                ? "DEBUG"
                : ("NATIVE" as const)

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
