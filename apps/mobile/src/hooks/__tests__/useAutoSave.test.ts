import { renderHook, act } from "@testing-library/react-native"
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
    it("starts with saving=false and saveSuccess=false", () => {
      const { result } = renderHook(() => useAutoSave())

      expect(result.current.saving).toBe(false)
      expect(result.current.saveSuccess).toBe(false)
    })
  })

  describe("debouncedSaveAndRestart", () => {
    it("does not call saveFn immediately", () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      expect(saveFn).not.toHaveBeenCalled()
    })

    it("calls saveFn after debounce delay", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(undefined)
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
      const restartFn = jest.fn().mockResolvedValue(undefined)
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

    it("sets saving=true during save, then schedules restart", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      // After save completes, restart is debounced
      expect(saveFn).toHaveBeenCalled()
      expect(restartFn).not.toHaveBeenCalled()

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(restartFn).toHaveBeenCalledTimes(1)
    })

    it("sets saveSuccess=true after restart completes, then clears it", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      // Trigger save
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      // Trigger restart
      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(result.current.saveSuccess).toBe(true)

      // Success display clears
      await act(async () => {
        jest.advanceTimersByTime(SAVE_SUCCESS_DISPLAY_MS)
      })

      expect(result.current.saveSuccess).toBe(false)
    })

    it("handles save failure gracefully", async () => {
      const saveFn = jest.fn().mockRejectedValue(new Error("save failed"))
      const restartFn = jest.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(result.current.saving).toBe(false)
      expect(restartFn).not.toHaveBeenCalled()
    })

    it("handles restart failure gracefully", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockRejectedValue(new Error("restart failed"))
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.debouncedSaveAndRestart(saveFn, restartFn)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      await act(async () => {
        jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
      })

      expect(result.current.saving).toBe(false)
      expect(result.current.saveSuccess).toBe(false)
    })
  })

  describe("immediateSaveAndRestart", () => {
    it("calls saveFn immediately", async () => {
      const saveFn = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      expect(saveFn).toHaveBeenCalledTimes(1)
    })

    it("sets saving=true immediately", () => {
      const saveFn = jest.fn().mockReturnValue(new Promise(() => {})) // never resolves
      const restartFn = jest.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAutoSave())

      act(() => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      expect(result.current.saving).toBe(true)
    })

    it("cancels any pending debounced save", async () => {
      const debouncedSave = jest.fn().mockResolvedValue(undefined)
      const immediateSave = jest.fn().mockResolvedValue(undefined)
      const restartFn = jest.fn().mockResolvedValue(undefined)
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
      const restartFn = jest.fn().mockResolvedValue(undefined)
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
      const restartFn = jest.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAutoSave())

      await act(async () => {
        result.current.immediateSaveAndRestart(saveFn, restartFn)
      })

      expect(result.current.saving).toBe(false)
      expect(restartFn).not.toHaveBeenCalled()
    })
  })
})
