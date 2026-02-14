import { renderHook, act } from "@testing-library/react-native"
import { useTimeout } from "../useTimeout"

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe("useTimeout", () => {
  it("executes callback after delay", () => {
    const callback = jest.fn()
    const { result } = renderHook(() => useTimeout())

    act(() => {
      result.current.set(callback, 1000)
    })

    expect(callback).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("cancels previous timeout when set is called again", () => {
    const callback1 = jest.fn()
    const callback2 = jest.fn()
    const { result } = renderHook(() => useTimeout())

    act(() => {
      result.current.set(callback1, 1000)
    })

    act(() => {
      result.current.set(callback2, 1000)
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(callback1).not.toHaveBeenCalled()
    expect(callback2).toHaveBeenCalledTimes(1)
  })

  it("clear cancels pending timeout", () => {
    const callback = jest.fn()
    const { result } = renderHook(() => useTimeout())

    act(() => {
      result.current.set(callback, 1000)
    })

    act(() => {
      result.current.clear()
    })

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it("cleans up on unmount", () => {
    const callback = jest.fn()
    const { result, unmount } = renderHook(() => useTimeout())

    act(() => {
      result.current.set(callback, 1000)
    })

    unmount()

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it("clear is safe to call with no pending timeout", () => {
    const { result } = renderHook(() => useTimeout())

    expect(() => {
      act(() => {
        result.current.clear()
      })
    }).not.toThrow()
  })
})
