import { lightColors, darkColors } from "@colota/shared"
import { buildDynamicColors, parseSystemPalette, type SystemPalette } from "../dynamicColors"

// A wallpaper palette in the Android numbering: 0 is the lightest step, 900 the darkest.
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

describe("parseSystemPalette", () => {
  it("accepts the complete map the bridge returns", () => {
    expect(parseSystemPalette({ ...palette })).toEqual(palette)
  })

  it("rejects a map missing a step, which would put undefined into a style prop", () => {
    const incomplete: Record<string, string> = { ...palette }
    delete incomplete.neutral2_500

    expect(parseSystemPalette(incomplete)).toBeNull()
  })

  it("rejects a value that is not opaque hex, because the theme concatenates alpha onto it", () => {
    expect(parseSystemPalette({ ...palette, accent1_600: "rgb(43, 92, 184)" })).toBeNull()
  })

  it("rejects null, which is what the bridge returns below API 31", () => {
    expect(parseSystemPalette(null)).toBeNull()
  })
})

describe("buildDynamicColors", () => {
  it("keeps the status colours out of the wallpaper, so an error stays red", () => {
    const light = buildDynamicColors(palette, false)
    const dark = buildDynamicColors(palette, true)

    expect(light.error).toBe(lightColors.error)
    expect(light.warning).toBe(lightColors.warning)
    expect(light.success).toBe(lightColors.success)
    expect(light.info).toBe(lightColors.info)
    expect(dark.error).toBe(darkColors.error)
  })

  it("fills every key the theme has, so no consumer reads undefined", () => {
    expect(Object.keys(buildDynamicColors(palette, false)).sort()).toEqual(Object.keys(lightColors).sort())
    expect(Object.keys(buildDynamicColors(palette, true)).sort()).toEqual(Object.keys(darkColors).sort())
  })

  it("pairs light text with a dark accent and the reverse, so contrast survives any wallpaper hue", () => {
    const light = buildDynamicColors(palette, false)
    const dark = buildDynamicColors(palette, true)

    // Light mode paints on a dark accent, so its ink is the lightest neutral.
    expect(light.primary).toBe(palette.accent1_600)
    expect(light.textOnPrimary).toBe(palette.neutral1_0)
    // Dark mode paints on a light accent, so its ink is the darkest.
    expect(dark.primary).toBe(palette.accent1_200)
    expect(dark.textOnPrimary).toBe(palette.neutral1_900)
  })

  it("puts dark ink on the light container and the reverse, which a single mapping could not", () => {
    const light = buildDynamicColors(palette, false)
    const dark = buildDynamicColors(palette, true)

    expect(light.primaryContainer).toBe(palette.accent1_100)
    expect(light.onPrimaryContainer).toBe(palette.accent1_900)
    expect(dark.primaryContainer).toBe(palette.accent1_800)
    expect(dark.onPrimaryContainer).toBe(palette.accent1_100)
  })

  it("puts text above its surface in tone, in both modes", () => {
    const light = buildDynamicColors(palette, false)
    const dark = buildDynamicColors(palette, true)

    expect(light.background).toBe(palette.neutral1_50)
    expect(light.text).toBe(palette.neutral1_900)
    expect(dark.background).toBe(palette.neutral1_900)
    expect(dark.text).toBe(palette.neutral1_50)
  })
})
