/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: { getBuildConfig: jest.fn() }
}))

import i18next from "i18next"
import NativeLocationService from "../../services/NativeLocationService"
import { initI18n, SUPPORTED_LANGUAGES, t } from "../index"
import en from "../locales/en.json"

const mockGetBuildConfig = NativeLocationService.getBuildConfig as jest.Mock

describe("initI18n", () => {
  beforeEach(() => {
    mockGetBuildConfig.mockReset()
  })

  it("uses the device language when a catalog exists for it", () => {
    mockGetBuildConfig.mockReturnValue({ APP_LANGUAGE: "en-GB" })

    // The device tag carries a region and the catalogs do not, so only the base tag can match.
    expect(initI18n()).toBe("en")
  })

  it("falls back to English for a language with no catalog", () => {
    mockGetBuildConfig.mockReturnValue({ APP_LANGUAGE: "pl-PL" })

    expect(initI18n()).toBe("en")
  })

  it("falls back to English when the native module is unavailable", () => {
    // getBuildConfig returns null when the bridge module is missing, which must not throw during
    // module-scope init or the app fails to start rather than starting in English.
    mockGetBuildConfig.mockReturnValue(null)

    expect(initI18n()).toBe("en")
  })

  it("resolves keys synchronously, so a first paint never shows raw keys", () => {
    mockGetBuildConfig.mockReturnValue({ APP_LANGUAGE: "en-US" })

    initI18n()

    expect(t("appearance.darkMode")).toBe("Dark Mode")
  })

  it("returns the key itself when it is missing, rather than empty text", () => {
    mockGetBuildConfig.mockReturnValue({ APP_LANGUAGE: "en" })
    initI18n()

    expect(t("appearance.doesNotExist")).toBe("appearance.doesNotExist")
  })
})

describe("catalog", () => {
  it("every supported language is a real i18next resource after init", () => {
    mockGetBuildConfig.mockReturnValue({ APP_LANGUAGE: "en" })
    initI18n()

    for (const lang of SUPPORTED_LANGUAGES) {
      expect(i18next.getResourceBundle(lang, "translation")).toBeTruthy()
    }
  })

  it("has no empty values, which would render as blank UI", () => {
    const empty = Object.entries(en).filter(([, value]) => String(value).trim() === "")

    expect(empty).toEqual([])
  })
})
