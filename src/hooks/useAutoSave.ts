/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback } from "react"
import { useTimeout } from "./useTimeout"
import { AUTOSAVE_DEBOUNCE_MS, SAVE_SUCCESS_DISPLAY_MS } from "../constants"

/**
 * Hook that encapsulates the debounced auto-save pattern used across settings screens.
 *
 * Manages:
 * - Debounced and immediate save triggers
 * - Saving/success state for FloatingSaveIndicator
 * - Timeout cleanup on unmount (via useTimeout)
 */
export function useAutoSave() {
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const saveTimeout = useTimeout()
  const restartTimeout = useTimeout()
  const successTimeout = useTimeout()

  const executeSave = useCallback(
    async (saveFn: () => Promise<void>) => {
      setSaving(true)
      try {
        await saveFn()
        setSaveSuccess(true)
        successTimeout.set(() => setSaveSuccess(false), SAVE_SUCCESS_DISPLAY_MS)
      } catch (err) {
        console.error("[useAutoSave] Save failed:", err)
      } finally {
        setSaving(false)
      }
    },
    [successTimeout]
  )

  const debouncedSave = useCallback(
    (saveFn: () => Promise<void>) => {
      saveTimeout.set(() => executeSave(saveFn), AUTOSAVE_DEBOUNCE_MS)
    },
    [saveTimeout, executeSave]
  )

  const immediateSave = useCallback(
    (saveFn: () => Promise<void>) => {
      saveTimeout.clear()
      executeSave(saveFn)
    },
    [saveTimeout, executeSave]
  )

  /**
   * Schedules a debounced restart after settings are persisted.
   * Use when you need to save settings first, then restart tracking after the debounce.
   */
  const debouncedSaveAndRestart = useCallback(
    (saveFn: () => Promise<void>, restartFn: () => Promise<void>) => {
      saveTimeout.set(async () => {
        setSaving(true)
        try {
          await saveFn()
          restartTimeout.set(async () => {
            try {
              await restartFn()
              setSaveSuccess(true)
              successTimeout.set(() => setSaveSuccess(false), SAVE_SUCCESS_DISPLAY_MS)
            } catch (err) {
              console.error("[useAutoSave] Restart failed:", err)
            } finally {
              setSaving(false)
            }
          }, AUTOSAVE_DEBOUNCE_MS)
        } catch (err) {
          setSaving(false)
          console.error("[useAutoSave] Save failed:", err)
        }
      }, AUTOSAVE_DEBOUNCE_MS)
    },
    [saveTimeout, restartTimeout, successTimeout]
  )

  /**
   * Immediately saves and schedules a debounced restart.
   * Use for discrete changes (toggle, preset selection) that should persist immediately
   * but batch the restart.
   */
  const immediateSaveAndRestart = useCallback(
    (saveFn: () => Promise<void>, restartFn: () => Promise<void>) => {
      saveTimeout.clear()
      setSaving(true)
      saveFn()
        .then(() => {
          restartTimeout.set(async () => {
            try {
              await restartFn()
              setSaveSuccess(true)
              successTimeout.set(() => setSaveSuccess(false), SAVE_SUCCESS_DISPLAY_MS)
            } catch (err) {
              console.error("[useAutoSave] Restart failed:", err)
            } finally {
              setSaving(false)
            }
          }, AUTOSAVE_DEBOUNCE_MS)
        })
        .catch((err) => {
          setSaving(false)
          console.error("[useAutoSave] Save failed:", err)
        })
    },
    [saveTimeout, restartTimeout, successTimeout]
  )

  return {
    saving,
    saveSuccess,
    debouncedSave,
    immediateSave,
    debouncedSaveAndRestart,
    immediateSaveAndRestart
  }
}
