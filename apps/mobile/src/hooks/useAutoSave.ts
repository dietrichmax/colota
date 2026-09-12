/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback } from "react"
import { useTimeout } from "./useTimeout"
import { AUTOSAVE_DEBOUNCE_MS, SAVE_SUCCESS_DISPLAY_MS } from "../constants"
import { logger } from "../utils/logger"

/**
 * The debounced auto-save behind the settings screens.
 *
 * A plain write is not announced: the control the user moved is the confirmation, which is how
 * Android settings behave. Only two outcomes get a message - a restart, because the service
 * cycling has nothing on screen to show for it, and a failure.
 */
export function useAutoSave() {
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)
  const saveTimeout = useTimeout()
  const restartTimeout = useTimeout()
  const messageTimeout = useTimeout()
  const successTimeout = useTimeout()

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
        setSaveSuccess(true)
        successTimeout.set(() => setSaveSuccess(false), SAVE_SUCCESS_DISPLAY_MS)
        if (await restartFn()) announce("Tracking restarted", false)
      } catch (err) {
        logger.error("[useAutoSave] Restart failed:", err)
        announce("Could not restart tracking", true)
      } finally {
        setSaving(false)
      }
    },
    [announce, successTimeout]
  )

  /**
   * Schedules a debounced restart after settings are persisted.
   * Use when you need to save settings first, then restart tracking after the debounce.
   */
  const debouncedSaveAndRestart = useCallback(
    (saveFn: () => Promise<void>, restartFn: () => Promise<boolean>) => {
      saveTimeout.set(async () => {
        setSaving(true)
        try {
          await saveFn()
        } catch (err) {
          setSaving(false)
          logger.error("[useAutoSave] Save failed:", err)
          announce("Could not save", true)
          return
        }
        // Restart immediately: the input was already debounced by saveTimeout.
        restartTimeout.clear()
        await runRestart(restartFn)
      }, AUTOSAVE_DEBOUNCE_MS)
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
      setSaving(true)
      saveFn()
        .then(() => {
          restartTimeout.set(() => runRestart(restartFn), AUTOSAVE_DEBOUNCE_MS)
        })
        .catch((err) => {
          setSaving(false)
          logger.error("[useAutoSave] Save failed:", err)
          announce("Could not save", true)
        })
    },
    [saveTimeout, restartTimeout, runRestart, announce]
  )

  return {
    saving,
    saveSuccess,
    message,
    isError,
    debouncedSaveAndRestart,
    immediateSaveAndRestart
  }
}
