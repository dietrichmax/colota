import { AccessibilityInfo } from "react-native"
import { renderHook, act } from "@testing-library/react-native"
import { useReduceMotion } from "../useReduceMotion"

describe("useReduceMotion", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("starts from the system setting", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true)

    const { result } = renderHook(() => useReduceMotion())
    await act(async () => {})

    expect(result.current).toBe(true)
  })

  // Android applies "remove animations" the moment it is switched on, without restarting
  // the app, so a value read once at mount would be stale for the rest of the session.
  it("follows the setting while the app is open", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
    let listener: ((enabled: boolean) => void) | undefined
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((_event: string, cb: unknown) => {
      listener = cb as (enabled: boolean) => void
      return { remove: jest.fn() }
    }) as never)

    const { result } = renderHook(() => useReduceMotion())
    await act(async () => {})
    expect(result.current).toBe(false)

    act(() => listener!(true))

    expect(result.current).toBe(true)
  })

  it("stops listening when the consumer unmounts", async () => {
    const remove = jest.fn()
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false)
    jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove } as never)

    const { unmount } = renderHook(() => useReduceMotion())
    await act(async () => {})
    unmount()

    expect(remove).toHaveBeenCalled()
  })
})
