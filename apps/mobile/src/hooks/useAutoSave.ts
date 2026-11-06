/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import { useTimeout } from "./useTimeout"
import { AUTOSAVE_DEBOUNCE_MS, SAVE_SUCCESS_DISPLAY_MS } from "../constants"
import { logger } from "../utils/logger"
import { t } from "../i18n/t"

/**
 * The debounced auto-save behind the settings screens.
 *
 * A plain write is not announced: the control the user moved is the confirmation, which is how
 * Android settings behave. Only two outcomes get a message - a restart, because the service
 * cycling has nothing on screen to show for it, and a failure.
 */
export function useAutoSave() {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const saveTimeout = useTimeout()
  const restartTimeout = useTimeout()
  const messageTimeout = useTimeout()
  const pending = useRef<(() => void) | null>(null)

  // A running service reads its config only at start. Not in the background: JS timers are paused
  // there, so restartTracking would stop the service and not start it again.
  useEffect(
    () => () => {
      if (AppState.currentState === "active") pending.current?.()
    },
    []
  )

  const announce = useCallback(
    (text: string, failed: boolean) => {
      setMessage(text)
      setIsError(failed)
      messageTimeout.set(() => setMessage(null), SAVE_SUCCESS_DISPLAY_MS)
    },
    [messageTimeout]
  )

  const runRestart = useCallback(
    async (restartFn: () => Promise<boolean>) => {
      try {
        if (await restartFn()) announce(t("autoSave.restarted"), false)
      } catch (err) {
        logger.error("[useAutoSave] Restart failed:", err)
        announce(t("autoSave.restartFailed"), true)
      } finally {
        setSaving(false)
      }
    },
    [announce]
  )

  /**
   * Schedules a debounced restart after settings are persisted.
   * Use when you need to save settings first, then restart tracking after the debounce.
   */
  const debouncedSaveAndRestart = useCallback(
    (saveFn: () => Promise<void>, restartFn: () => Promise<boolean>) => {
      const run = async () => {
        pending.current = null
        setSaving(true)
        try {
          await saveFn()
        } catch (err) {
          setSaving(false)
          logger.error("[useAutoSave] Save failed:", err)
          announce(t("autoSave.saveFailed"), true)
          return
        }
        // Restart immediately: the input was already debounced by saveTimeout.
        restartTimeout.clear()
        await runRestart(restartFn)
      }
      pending.current = run
      saveTimeout.set(run, AUTOSAVE_DEBOUNCE_MS)
    },
    [saveTimeout, restartTimeout, runRestart, announce]
  )

  /**
   * Immediately saves and schedules a debounced restart.
   * Use for discrete changes (toggle, preset selection) that should persist immediately
   * but batch the restart.
   */
  const immediateSaveAndRestart = useCallback(
    (saveFn: () => Promise<void>, restartFn: () => Promise<boolean>) => {
      saveTimeout.clear()
      pending.current = null
      setSaving(true)
      saveFn()
        .then(() => {
          const restart = () => {
            pending.current = null
            runRestart(restartFn)
          }
          pending.current = restart
          restartTimeout.set(restart, AUTOSAVE_DEBOUNCE_MS)
        })
        .catch((err) => {
          setSaving(false)
          logger.error("[useAutoSave] Save failed:", err)
          announce(t("autoSave.saveFailed"), true)
        })
    },
    [saveTimeout, restartTimeout, runRestart, announce]
  )

  return {
    saving,
    message,
    isError,
    debouncedSaveAndRestart,
    immediateSaveAndRestart
  }
}
