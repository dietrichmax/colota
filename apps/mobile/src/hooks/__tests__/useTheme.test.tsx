import React from "react"
import { renderHook, act, waitFor } from "@testing-library/react-native"
import { Appearance, AppState } from "react-native"
import { lightColors, darkColors } from "@colota/shared"

import NativeLocationService from "../../services/NativeLocationService"
import type { SystemPalette } from "../../styles/dynamicColors"
import { ThemeProvider, useTheme } from "../useTheme"

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getSetting: jest.fn().mockResolvedValue(null),
    saveSetting: jest.fn().mockResolvedValue(undefined),
    getSystemPalette: jest.fn().mockResolvedValue(null)
  }
}))

let appearanceListener: ((prefs: { colorScheme: string | null }) => void) | null = null
let appStateListener: ((state: string) => void) | null = null

jest.spyOn(Appearance, "getColorScheme").mockReturnValue("light")
jest.spyOn(Appearance, "addChangeListener").mockImplementation((cb: any) => {
  appearanceListener = cb
  return { remove: jest.fn() }
})

const palette: SystemPalette = {
  accent1_100: "#D6E3FF",
  accent1_200: "#ABC7FF",
  accent1_300: "#8AB4F8",
  accent1_600: "#2B5CB8",
  accent1_700: "#12459E",
  accent1_800: "#002E6B",
  accent1_900: "#001B3F",
  neutral1_0: "#FFFFFF",
  neutral1_50: "#F3F3F6",
  neutral1_600: "#5B5C63",
  neutral1_700: "#43444B",
  neutral1_800: "#2C2D33",
  neutral1_900: "#1A1B1F",
  neutral2_100: "#E3E2E9",
  neutral2_200: "#C7C6CE",
  neutral2_300: "#ABAAB2",
  neutral2_400: "#909097",
  neutral2_500: "#76767D",
  neutral2_600: "#5E5E65",
  neutral2_700: "#46464D",
  neutral2_800: "#2F2F35"
}

const settings = (values: Record<string, string | null>) => {
  ;(NativeLocationService.getSetting as jest.Mock).mockImplementation(async (key: string) => values[key] ?? null)
}

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

beforeEach(() => {
  appearanceListener = null
  appStateListener = null
  ;(Appearance.getColorScheme as jest.Mock).mockReturnValue("light")
  ;(NativeLocationService.getSetting as jest.Mock).mockResolvedValue(null)
  ;(NativeLocationService.getSystemPalette as jest.Mock).mockClear().mockResolvedValue(null)
  ;(NativeLocationService.saveSetting as jest.Mock).mockClear()
  ;(AppState.addEventListener as jest.Mock).mockImplementation((_: string, cb: (state: string) => void) => {
    appStateListener = cb
    return { remove: jest.fn() }
  })
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

    const before = result.current.colors

    act(() => {
      result.current.setPreference("dark")
    })

    expect(before).not.toBe(result.current.colors)
  })
})

describe("wallpaper colors", () => {
  it("offers nothing to turn on where the platform has no palette", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(NativeLocationService.getSystemPalette).toHaveBeenCalled()
    })
    expect(result.current.wallpaperColorsAvailable).toBe(false)
  })

  it("keeps the brand palette while the toggle is off, so having one is not using one", async () => {
    ;(NativeLocationService.getSystemPalette as jest.Mock).mockResolvedValue(palette)

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.wallpaperColorsAvailable).toBe(true)
    })
    expect(result.current.colors.primary).toBe(lightColors.primary)
  })

  it("paints from the wallpaper once it is turned on", async () => {
    ;(NativeLocationService.getSystemPalette as jest.Mock).mockResolvedValue(palette)

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.wallpaperColorsAvailable).toBe(true)
    })
    act(() => {
      result.current.setWallpaperColors(true)
    })

    expect(result.current.colors.primary).toBe(palette.accent1_600)
  })

  it("stays on the brand palette when the bridge answers with nothing to map", async () => {
    settings({ wallpaperColors: "true" })

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.wallpaperColors).toBe(true)
    })
    expect(result.current.colors).toBe(lightColors)
  })

  it("applies to dark as well, because the palette is not a fourth mode", async () => {
    ;(NativeLocationService.getSystemPalette as jest.Mock).mockResolvedValue(palette)
    settings({ themeMode: "dark", wallpaperColors: "true" })

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.isDark).toBe(true)
    })
    expect(result.current.colors.primary).toBe(palette.accent1_200)
    expect(result.current.colors.error).toBe(darkColors.error)
  })

  it("restores the saved choice on mount", async () => {
    ;(NativeLocationService.getSystemPalette as jest.Mock).mockResolvedValue(palette)
    settings({ wallpaperColors: "true" })

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.wallpaperColors).toBe(true)
    })
  })

  it("persists the choice, so a restart does not lose it", async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })

    act(() => {
      result.current.setWallpaperColors(true)
    })

    expect(NativeLocationService.saveSetting).toHaveBeenCalledWith("wallpaperColors", "true")
  })

  it("re-reads the palette on foreground, because the wallpaper changes outside the app", async () => {
    settings({ wallpaperColors: "true" })

    const { result } = renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(result.current.wallpaperColors).toBe(true)
    })
    ;(NativeLocationService.getSystemPalette as jest.Mock).mockResolvedValue(palette)

    await act(async () => {
      appStateListener!("active")
    })

    expect(result.current.colors.primary).toBe(palette.accent1_600)
  })

  it("ignores a background transition, which cannot have changed the wallpaper on screen", async () => {
    renderHook(() => useTheme(), { wrapper })

    await waitFor(() => {
      expect(NativeLocationService.getSystemPalette).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      appStateListener!("background")
    })

    expect(NativeLocationService.getSystemPalette).toHaveBeenCalledTimes(1)
  })
})
