/**
 * Logger utility that suppresses debug/info logs in production builds.
 * Uses React Native's __DEV__ flag to determine environment.
 *
 * - debug/info: Only logged in development
 * - warn/error: Always logged
 */

/* eslint-disable no-console */

export const logger = {
  debug: (...args: unknown[]) => {
    if (__DEV__) console.log(...args)
  },
  info: (...args: unknown[]) => {
    if (__DEV__) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    console.warn(...args)
  },
  error: (...args: unknown[]) => {
    console.error(...args)
  }
}
