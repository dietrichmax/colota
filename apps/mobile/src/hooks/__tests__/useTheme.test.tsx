import React from "react"
import { renderHook, act, waitFor } from "@testing-library/react-native"
import { Appearance } from "react-native"

import NativeLocationService from "../../services/NativeLocationService"
import { ThemeProvider, useTheme } from "../useTheme"

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getSetting: jest.fn().mockResolvedValue(null),
    saveSetting: jest.fn().mockResolvedValue(undefined)
  }
}))

let appearanceListener: ((prefs: { colorScheme: string | null }) => void) | null = null

jest.spyOn(Appearance, "getColorScheme").mockReturnValue("light")
jest.spyOn(Appearance, "addChangeListener").mockImplementation((cb: any) => {
  appearanceListener = cb
  return { remove: jest.fn() }
})

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

beforeEach(() => {
  appearanceListener = null
  ;(Appearance.getColorScheme as jest.Mock).mockReturnValue("light")
  ;(NativeLocationService.getSetting as jest.Mock).mockResolvedValue(null)
  ;(NativeLocationService.saveSetting as jest.Mock).mockClear()
})

describe("useTheme", () => {
  it("throws when used outside ThemeProvider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation()

    expect(() => {
      renderHook(() => useTheme())
    }).toThrow("useTheme must be used within a ThemeProvider")

    spy.mockRestore()
  })

  it("initializes with system theme (light)", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.mode).toBe("light")
    expect(result.current.isDark).toBe(false)
    expect(result.current.colors).toBeDefined()
    expect(result.current.colors.primary).toBeDefined()
  })

  it("initializes with system theme (dark)", () => {
    ;(Appearance.getColorScheme as jest.Mock).mockReturnValue("dark")

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.mode).toBe("dark")
    expect(result.current.isDark).toBe(true)
  })

  it("defaults to light when system scheme is null", () => {
    ;(Appearance.getColorScheme as jest.Mock).mockReturnValue(null)

    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.mode).toBe("light")
  })

  it("picking a mode overrides the system, which is the point of picking one", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setPreference("dark")
    })

    expect(result.current.mode).toBe("dark")
    expect(result.current.isDark).toBe(true)
  })

  it("keeps following the system until something is picked", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    expect(result.current.preference).toBe("system")

    act(() => {
      appearanceListener!({ colorScheme: "dark" })
    })

    expect(result.current.mode).toBe("dark")
  })

  it("stops following the system once a mode is picked", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setPreference("dark")
    })
    act(() => {
      appearanceListener?.({ colorScheme: "light" })
    })

    expect(result.current.mode).toBe("dark")
  })

  it("follows the system again when system is picked back, which a toggle could not express", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setPreference("dark")
    })
    act(() => {
      result.current.setPreference("system")
    })
    act(() => {
      appearanceListener?.({ colorScheme: "light" })
    })

    expect(result.current.mode).toBe("light")
  })

  it("persists the choice, system included, so a restart does not lose it", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setPreference("dark")
    })
    expect(NativeLocationService.saveSetting).toHaveBeenCalledWith("themeMode", "dark")

    act(() => {
      result.current.setPreference("system")
    })
    expect(NativeLocationService.saveSetting).toHaveBeenCalledWith("themeMode", "system")
  })

  it("restores persisted dark theme on mount", async () => {
    ;(NativeLocationService.getSetting as jest.Mock).mockResolvedValue("dark")

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.mode).toBe("dark")
    })
    expect(result.current.isDark).toBe(true)
  })

  it("restores persisted light theme on mount", async () => {
    ;(Appearance.getColorScheme as jest.Mock).mockReturnValue("dark")
    ;(NativeLocationService.getSetting as jest.Mock).mockResolvedValue("light")

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.mode).toBe("light")
    })
  })

  it("provides different color objects for light and dark modes", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    const lightColors = result.current.colors

    act(() => {
      result.current.setPreference("dark")
    })

    expect(lightColors).not.toBe(result.current.colors)
  })
})
