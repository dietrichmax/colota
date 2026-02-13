import SettingsService from "../SettingsService"
import NativeLocationService from "../NativeLocationService"

jest.mock("../NativeLocationService", () => ({
  saveSetting: jest.fn().mockResolvedValue(undefined)
}))

const mockSaveSetting = NativeLocationService.saveSetting as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe("SettingsService", () => {
  describe("updateSetting", () => {
    it("converts interval from seconds to milliseconds", async () => {
      await SettingsService.updateSetting("interval", 5)

      // Should save interval * 1000
      expect(mockSaveSetting).toHaveBeenCalledWith("interval", "5000")
    })

    it("saves distance to both 'minUpdateDistance' and 'distance' keys", async () => {
      await SettingsService.updateSetting("distance", 10)

      expect(mockSaveSetting).toHaveBeenCalledWith("minUpdateDistance", "10")
      expect(mockSaveSetting).toHaveBeenCalledWith("distance", "10")
    })

    it("stringifies fieldMap as JSON", async () => {
      const fieldMap = { lat: "latitude", lon: "longitude", acc: "accuracy" }
      await SettingsService.updateSetting("fieldMap", fieldMap)

      expect(mockSaveSetting).toHaveBeenCalledWith("fieldMap", JSON.stringify(fieldMap))
    })

    it("stringifies customFields as JSON", async () => {
      const customFields = [{ key: "_type", value: "location" }]
      await SettingsService.updateSetting("customFields", customFields)

      expect(mockSaveSetting).toHaveBeenCalledWith("customFields", JSON.stringify(customFields))
    })

    it("saves boolean isOfflineMode as string", async () => {
      await SettingsService.updateSetting("isOfflineMode", true)
      expect(mockSaveSetting).toHaveBeenCalledWith("isOfflineMode", "true")

      await SettingsService.updateSetting("isOfflineMode", false)
      expect(mockSaveSetting).toHaveBeenCalledWith("isOfflineMode", "false")
    })

    it("saves boolean filterInaccurateLocations as string", async () => {
      await SettingsService.updateSetting("filterInaccurateLocations", true)
      expect(mockSaveSetting).toHaveBeenCalledWith("filterInaccurateLocations", "true")
    })

    it("saves syncInterval as string number", async () => {
      await SettingsService.updateSetting("syncInterval", 300)
      expect(mockSaveSetting).toHaveBeenCalledWith("syncInterval", "300")
    })

    it("saves endpoint as string", async () => {
      await SettingsService.updateSetting("endpoint", "https://example.com/api")
      expect(mockSaveSetting).toHaveBeenCalledWith("endpoint", "https://example.com/api")
    })

    it("returns true on success", async () => {
      const result = await SettingsService.updateSetting("endpoint", "https://test.com")
      expect(result).toBe(true)
    })

    it("returns false on error", async () => {
      mockSaveSetting.mockRejectedValueOnce(new Error("Native error"))
      const result = await SettingsService.updateSetting("endpoint", "test")
      expect(result).toBe(false)
    })
  })

  describe("updateMultiple", () => {
    it("calls updateSetting for each key", async () => {
      await SettingsService.updateMultiple({
        interval: 10,
        endpoint: "https://test.com"
      })

      // interval saves as ms
      expect(mockSaveSetting).toHaveBeenCalledWith("interval", "10000")
      expect(mockSaveSetting).toHaveBeenCalledWith("endpoint", "https://test.com")
    })

    it("handles empty update object", async () => {
      await SettingsService.updateMultiple({})
      expect(mockSaveSetting).not.toHaveBeenCalled()
    })
  })
})
