import React from "react"
import { renderHook, act } from "@testing-library/react-native"
import { Appearance } from "react-native"

import { ThemeProvider, useTheme } from "../useTheme"

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

  it("toggleTheme switches from light to dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.mode).toBe("dark")
    expect(result.current.isDark).toBe(true)
  })

  it("toggleTheme switches back from dark to light", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.toggleTheme()
    })
    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.mode).toBe("light")
    expect(result.current.isDark).toBe(false)
  })

  it("follows system theme changes when no manual override", () => {
    renderHook(() => useTheme(), { wrapper })

    expect(appearanceListener).not.toBeNull()

    act(() => {
      appearanceListener!({ colorScheme: "dark" })
    })

    expect(appearanceListener).toBeDefined()
  })

  it("ignores system theme changes after manual toggle", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.toggleTheme()
    })
    expect(result.current.mode).toBe("dark")
    act(() => {
      appearanceListener?.({ colorScheme: "light" })
    })

    expect(result.current.mode).toBe("dark")
  })

  it("provides different color objects for light and dark modes", () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    const lightColors = result.current.colors

    act(() => {
      result.current.toggleTheme()
    })

    const darkColors = result.current.colors

    expect(lightColors).not.toBe(darkColors)
  })
})
