import i18next from "i18next"

const fs: {
  readFileSync: (file: string, encoding: "utf8") => string
  readdirSync: (dir: string) => string[]
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

const mockGetAppLanguage = jest.fn()

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getAppLanguage: () => mockGetAppLanguage(),
    setAppLanguage: jest.fn()
  }
}))

import { syncLanguage } from "../language"
import { I18N_OPTIONS, SUPPORTED_LANGUAGES } from "../options"

describe("syncLanguage", () => {
  beforeAll(async () => {
    await i18next.init({ ...I18N_OPTIONS, lng: "en" })
  })

  // Android's App languages page changes the app locale without the picker ever running.
  it("moves the catalog to the language Android now runs the app in", async () => {
    await i18next.changeLanguage("xx")
    mockGetAppLanguage.mockResolvedValue({ picked: "", effective: "en-US" })

    await syncLanguage()

    expect(i18next.language).toBe("en")
  })

  it("leaves the catalog alone when the language is already right or cannot be read", async () => {
    await i18next.changeLanguage("en")
    const change = jest.spyOn(i18next, "changeLanguage")
    mockGetAppLanguage.mockResolvedValueOnce({ picked: "", effective: "en-GB" }).mockResolvedValueOnce(null)

    await syncLanguage()
    await syncLanguage()

    expect(change).not.toHaveBeenCalled()
    change.mockRestore()
  })
})

// Android offers every locale listed here under App languages, so a missing catalog would be selectable.
it("lists exactly the shipped catalogs in locales_config.xml", () => {
  const xml = fs.readFileSync(path.join(__dirname, "../../../android/app/src/main/res/xml/locales_config.xml"), "utf8")
  const listed = [...xml.matchAll(/<locale android:name="([^"]+)"/g)].map((m) => m[1]).sort()
  expect(listed).toEqual([...SUPPORTED_LANGUAGES].sort())
})

// A translator's file is checked even before it is registered, so a broken one fails its pull request.
describe("every catalog in locales/", () => {
  const dir = path.join(__dirname, "../locales")
  const en = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8")) as Record<string, string>
  const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort()
  const catalogs = fs.readdirSync(dir).filter((f: string) => f.endsWith(".json") && f !== "en.json")

  it.each(catalogs.length ? catalogs : ["(none yet)"])(
    "%s uses only English keys and keeps their placeholders",
    (file) => {
      if (file === "(none yet)") return
      const catalog = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, string>
      for (const [key, text] of Object.entries(catalog)) {
        expect(en).toHaveProperty([key])
        expect(placeholders(text)).toEqual(placeholders(en[key]))
      }
    }
  )
})
