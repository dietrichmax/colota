import { renderHook, act } from "@testing-library/react-native"
import { AppState } from "react-native"
import { useAutoSave } from "../useAutoSave"
import { AUTOSAVE_DEBOUNCE_MS, SAVE_SUCCESS_DISPLAY_MS } from "../../constants"

beforeEach(() => {
  jest.useFakeTimers()
  jest.spyOn(console, "error").mockImplementation()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe("useAutoSave", () => {
  describe("initial state", () => {
    it("starts with saving=false and nothing to say", () => {
      const { result } = renderHook(() => useAutoSave())

      expect(result.current.saving).toBe(false)
      expect(result.current.message).toBeNull()
    })
  })

  describe("debouncedSaveAndRestart", () => {
    it("does not call saveFn immediately", () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      expect(saveFn).not.toHaveBeenCalled()
    })

    it("calls saveFn after debounce delay", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(saveFn).toHaveBeenCalledTimes(1)
    })

    it("cancels previous debounce when called again", async () => {
      const saveFn1 = jest.fn().mockResolvedValue(undefined)
      const saveFn2 = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn1, restartFn)
      })

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn2, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(saveFn1).not.toHaveBeenCalled()
      expect(saveFn2).toHaveBeenCalledTimes(1)
    })

    it("sets saving=true during save, then restarts immediately", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      // After debounced save completes, restart fires immediately (no second debounce)
      expect(saveFn).toHaveBeenCalled()
      expect(restartFn).toHaveBeenCalledTimes(1)
    })

    it("says the service was restarted, because nothing on screen shows that it was", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      // Trigger save + restart (restart fires immediately after debounced save)
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(result.current.message).toBe("Tracking restarted")
      expect(result.current.isError).toBe(false)

      await act(async () => {
        jest.advanceTimersByTime(SAVE_SUCCESS_DISPLAY_MS)
      })

      expect(result.current.message).toBeNull()
    })

    it("stays quiet when the service was not running, since a plain write needs no confirming", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(false)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(result.current.message).toBeNull()
    })

    it("says a failed save failed, rather than looking exactly like a success", async () => {
      const saveFn = jest.fn().mockRejectedValue(new Error("save failed"))
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(result.current.saving).toBe(false)
      expect(result.current.message).toBe("Could not save")
      expect(result.current.isError).toBe(true)
      expect(restartFn).not.toHaveBeenCalled()
    })

    it("says a failed restart failed, which was silent before", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockRejectedValue(new Error("restart failed"))
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      // Save + restart both fire after debounce (restart is immediate after save)
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(result.current.saving).toBe(false)
      expect(result.current.message).toBe("Could not restart tracking")
      expect(result.current.isError).toBe(true)
    })
  })

  describe("immediateSaveAndRestart", () => {
    it("calls saveFn immediately", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      expect(saveFn).toHaveBeenCalledTimes(1)
    })

    it("sets saving=true immediately", () => {
      const saveFn = jest.fn().mockReturnValue(new Promise(() => {})) // never resolves
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      expect(result.current.saving).toBe(true)
    })

    it("cancels any pending debounced save", async () => {
      const debouncedSave = jest.fn().mockResolvedValue(undefined)
      const immediateSave = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      // Start a debounced save
      act(() => {
        result.current.debouncedSaveAndRestart(debouncedSave, restartFn)
      })

      // Immediately save (should cancel debounced)
      await act(async () => {
        result.current.immediateSaveAndRestart(immediateSave, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(debouncedSave).not.toHaveBeenCalled()
      expect(immediateSave).toHaveBeenCalledTimes(1)
    })

    it("schedules debounced restart after save", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      // Restart not called yet (debounced)
      expect(restartFn).not.toHaveBeenCalled()

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(restartFn).toHaveBeenCalledTimes(1)
    })

    it("handles save failure gracefully", async () => {
      const saveFn = jest.fn().mockRejectedValue(new Error("save failed"))
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      expect(result.current.saving).toBe(false)
      expect(restartFn).not.toHaveBeenCalled()
    })
  })

  describe("leaving the screen inside the debounce", () => {
    beforeEach(() => {
      Object.assign(AppState, { currentState: "active" })
    })

    it("saves a pending typed change at once, or nothing ever stores it", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        unmount()
      })

      expect(saveFn).toHaveBeenCalledTimes(1)
      expect(restartFn).toHaveBeenCalledTimes(1)
    })

    it("restarts at once after a toggle, since the running service reads its config only at start", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        unmount()
      })

      expect(saveFn).toHaveBeenCalledTimes(1)
      expect(restartFn).toHaveBeenCalledTimes(1)
    })

    it("restarts once, for the toggle that replaced a typed change", async () => {
      const typedSave = jest.fn().mockResolvedValue(undefined)
      const typedRestart = jest.fn().mockResolvedValue(true)
      const toggleSave = jest.fn().mockResolvedValue(undefined)
      const toggleRestart = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(typedSave, typedRestart)
      })
      await act(async () => {
        result.current.immediateSaveAndRestart(toggleSave, toggleRestart)
      })

      await act(async () => {
        unmount()
      })

      expect(typedSave).not.toHaveBeenCalled()
      expect(typedRestart).not.toHaveBeenCalled()
      expect(toggleRestart).toHaveBeenCalledTimes(1)
    })

    it("never writes the older typed change over a toggle whose save is still running", async () => {
      const typedSave = jest.fn().mockResolvedValue(undefined)
      const toggleSave = jest.fn(() => new Promise<void>(() => {}))
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(typedSave, restartFn)
      })
      act(() => {
        result.current.immediateSaveAndRestart(toggleSave, restartFn)
      })

      await act(async () => {
        unmount()
      })

      expect(typedSave).not.toHaveBeenCalled()
    })

    it("still restarts for a toggle whose save lands after the screen closed", async () => {
      let landSave = () => {}
      const saveFn = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            landSave = resolve
          })
      )
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      act(() => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })
      await act(async () => {
        unmount()
      })

      await act(async () => {
        landSave()
      })
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(restartFn).toHaveBeenCalledTimes(1)
    })
  })

  describe("leaving the screen after the debounce", () => {
    beforeEach(() => {
      Object.assign(AppState, { currentState: "active" })
    })

    it("does not restart again, since each restart cycles the service", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      await act(async () => {
        unmount()
      })

      expect(restartFn).toHaveBeenCalledTimes(1)
    })

    it("does not save a typed change a second time", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      await act(async () => {
        unmount()
      })

      expect(saveFn).toHaveBeenCalledTimes(1)
      expect(restartFn).toHaveBeenCalledTimes(1)
    })
  })

  describe("the screen closing while the app is in the background", () => {
    beforeEach(() => {
      Object.assign(AppState, { currentState: "background" })
    })

    it("does not restart, since JS timers are paused and the stopped service would not start again", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(true)
      const { result, unmount } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        unmount()
      })

      expect(restartFn).not.toHaveBeenCalled()
    })
  })
})
