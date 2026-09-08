import { renderHook, waitFor } from "@testing-library/react-native"

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn() }
}))

const mockGetProfiles = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getProfiles: (...args: unknown[]) => mockGetProfiles(...args)
  }
}))

import { useActiveProfile } from "../useActiveProfile"
import { logger } from "../../utils/logger"

const profiles = [
  { id: 3, name: "Charging", interval: 5, distance: 20, syncInterval: 900 },
  { id: 7, name: "Night", interval: 300, distance: 50, syncInterval: 3600 }
]

beforeEach(() => {
  jest.clearAllMocks()
  mockGetProfiles.mockResolvedValue(profiles)
})

describe("useActiveProfile", () => {
  it("resolves the profile behind the id, so a screen can print the values in force", async () => {
    const { result } = renderHook(() => useActiveProfile(7))

    await waitFor(() => expect(result.current?.name).toBe("Night"))
  })

  it("is null with no id and reads nothing, since nothing is in force", () => {
    const { result } = renderHook(() => useActiveProfile(null))

    expect(result.current).toBeNull()
    expect(mockGetProfiles).not.toHaveBeenCalled()
  })

  it("is null when the id matches no saved profile, rather than showing a stale one", async () => {
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useActiveProfile(id), {
      initialProps: { id: 3 as number | null }
    })
    await waitFor(() => expect(result.current?.name).toBe("Charging"))

    rerender({ id: 99 })

    await waitFor(() => expect(result.current).toBeNull())
  })

  it("clears when the profile deactivates", async () => {
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useActiveProfile(id), {
      initialProps: { id: 3 as number | null }
    })
    await waitFor(() => expect(result.current?.name).toBe("Charging"))

    rerender({ id: null })

    expect(result.current).toBeNull()
  })

  it("only logs a failed read, because the line is background state", async () => {
    mockGetProfiles.mockRejectedValue(new Error("db closed"))
    const { result } = renderHook(() => useActiveProfile(3))

    await waitFor(() => expect(logger.error).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
