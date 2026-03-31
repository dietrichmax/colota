/**
 * Logger utility that suppresses debug/info logs in production builds.
 * Uses React Native's __DEV__ flag to determine environment.
 *
 * - debug/info: Only logged in development console
 * - warn/error: Always logged to console
 *
 * All levels are always captured in a ring buffer for export
 * via the Activity Log screen.
 */

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

const MAX_BUFFER_SIZE = 2000
const logBuffer: LogEntry[] = []

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.message
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    })
    .join(" ")
}

function pushEntry(level: LogLevel, args: unknown[]): void {
  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    logBuffer.splice(0, logBuffer.length - MAX_BUFFER_SIZE + 1)
  }
  logBuffer.push({
    timestamp: new Date().toISOString(),
    level,
    message: formatArgs(args)
  })
}

export function getLogEntries(): readonly LogEntry[] {
  return logBuffer
}

export function clearLogBuffer(): void {
  logBuffer.length = 0
}

export const logger = {
  debug: (...args: unknown[]) => {
    pushEntry("DEBUG", args)
    if (__DEV__) console.log(...args)
  },
  info: (...args: unknown[]) => {
    pushEntry("INFO", args)
    if (__DEV__) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    pushEntry("WARN", args)
    console.warn(...args)
  },
  error: (...args: unknown[]) => {
    pushEntry("ERROR", args)
    console.error(...args)
  }
}
