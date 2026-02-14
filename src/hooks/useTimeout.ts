/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useRef, useEffect, useCallback } from "react"

/**
 * Hook that manages a single timeout with automatic cleanup on unmount.
 * Replaces scattered timeout ref + cleanup patterns across screens.
 */
export function useTimeout() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const set = useCallback((callback: () => void, delay: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(callback, delay)
  }, [])

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  return { set, clear }
}
