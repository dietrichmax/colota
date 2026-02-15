import { DEFAULT_SETTINGS, DEFAULT_FIELD_MAP, TRACKING_PRESETS, API_TEMPLATES, Settings } from "../global"

describe("DEFAULT_FIELD_MAP", () => {
  const requiredKeys = ["lat", "lon", "acc"]
  const optionalKeys = ["alt", "vel", "batt", "bs", "tst", "bear"]

  it("has all required field keys", () => {
    for (const key of requiredKeys) {
      expect(DEFAULT_FIELD_MAP).toHaveProperty(key)
      expect(DEFAULT_FIELD_MAP[key as keyof typeof DEFAULT_FIELD_MAP]).toBeTruthy()
    }
  })

  it("has all optional field keys", () => {
    for (const key of optionalKeys) {
      expect(DEFAULT_FIELD_MAP).toHaveProperty(key)
    }
  })

  it("has exactly 9 keys", () => {
    expect(Object.keys(DEFAULT_FIELD_MAP)).toHaveLength(9)
  })
})

describe("DEFAULT_SETTINGS", () => {
  it("has positive interval", () => {
    expect(DEFAULT_SETTINGS.interval).toBeGreaterThan(0)
  })

  it("has non-negative distance", () => {
    expect(DEFAULT_SETTINGS.distance).toBeGreaterThanOrEqual(0)
  })

  it("has empty endpoint by default", () => {
    expect(DEFAULT_SETTINGS.endpoint).toBe("")
  })

  it("uses DEFAULT_FIELD_MAP", () => {
    expect(DEFAULT_SETTINGS.fieldMap).toEqual(DEFAULT_FIELD_MAP)
  })

  it("has empty customFields array", () => {
    expect(DEFAULT_SETTINGS.customFields).toEqual([])
  })

  it("has 'custom' apiTemplate", () => {
    expect(DEFAULT_SETTINGS.apiTemplate).toBe("custom")
  })

  it("has positive maxRetries", () => {
    expect(DEFAULT_SETTINGS.maxRetries).toBeGreaterThan(0)
  })

  it("has offline mode disabled", () => {
    expect(DEFAULT_SETTINGS.isOfflineMode).toBe(false)
  })

  it("defaults to POST httpMethod", () => {
    expect(DEFAULT_SETTINGS.httpMethod).toBe("POST")
  })

  it("has all required Settings keys", () => {
    const requiredKeys: (keyof Settings)[] = [
      "interval",
      "distance",
      "endpoint",
      "fieldMap",
      "customFields",
      "apiTemplate",
      "syncInterval",
      "retryInterval",
      "maxRetries",
      "isOfflineMode",
      "syncPreset",
      "filterInaccurateLocations",
      "accuracyThreshold",
      "httpMethod"
    ]

    for (const key of requiredKeys) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key)
    }
  })
})

describe("TRACKING_PRESETS", () => {
  const presetNames = ["instant", "balanced", "powersaver"] as const

  it("has all expected presets", () => {
    for (const name of presetNames) {
      expect(TRACKING_PRESETS).toHaveProperty(name)
    }
  })

  it.each(presetNames)("%s has positive interval", (name) => {
    expect(TRACKING_PRESETS[name].interval).toBeGreaterThan(0)
  })

  it.each(presetNames)("%s has non-negative distance", (name) => {
    expect(TRACKING_PRESETS[name].distance).toBeGreaterThanOrEqual(0)
  })

  it.each(presetNames)("%s has non-negative syncInterval", (name) => {
    expect(TRACKING_PRESETS[name].syncInterval).toBeGreaterThanOrEqual(0)
  })

  it.each(presetNames)("%s has positive retryInterval", (name) => {
    expect(TRACKING_PRESETS[name].retryInterval).toBeGreaterThan(0)
  })

  it.each(presetNames)("%s has a label", (name) => {
    expect(TRACKING_PRESETS[name].label).toBeTruthy()
  })

  it.each(presetNames)("%s has valid batteryImpact", (name) => {
    expect(["Low", "Medium", "High"]).toContain(TRACKING_PRESETS[name].batteryImpact)
  })

  it("instant has shortest interval", () => {
    expect(TRACKING_PRESETS.instant.interval).toBeLessThan(TRACKING_PRESETS.balanced.interval)
    expect(TRACKING_PRESETS.balanced.interval).toBeLessThan(TRACKING_PRESETS.powersaver.interval)
  })
})

describe("API_TEMPLATES", () => {
  const templateNames = ["dawarich", "owntracks", "phonetrack", "reitti", "traccar"] as const

  it.each(templateNames)("%s has valid fieldMap with required keys", (name) => {
    const template = API_TEMPLATES[name]
    expect(template.fieldMap).toHaveProperty("lat")
    expect(template.fieldMap).toHaveProperty("lon")
    expect(template.fieldMap).toHaveProperty("acc")
  })

  it.each(templateNames)("%s has non-empty customFields", (name) => {
    expect(API_TEMPLATES[name].customFields.length).toBeGreaterThan(0)
  })

  it.each(templateNames)("%s has label and description", (name) => {
    expect(API_TEMPLATES[name].label).toBeTruthy()
    expect(API_TEMPLATES[name].description).toBeTruthy()
  })

  it.each(templateNames)("%s customFields have key and value", (name) => {
    for (const field of API_TEMPLATES[name].customFields) {
      expect(field.key).toBeTruthy()
      expect(field.value).toBeTruthy()
    }
  })

  it("dawarich and owntracks use 'cog' for bearing", () => {
    expect(API_TEMPLATES.dawarich.fieldMap.bear).toBe("cog")
    expect(API_TEMPLATES.owntracks.fieldMap.bear).toBe("cog")
  })

  it("reitti uses 'bear' for bearing", () => {
    expect(API_TEMPLATES.reitti.fieldMap.bear).toBe("bear")
  })

  it("phonetrack remaps fields for Nextcloud PhoneTrack", () => {
    expect(API_TEMPLATES.phonetrack.fieldMap.vel).toBe("speed")
    expect(API_TEMPLATES.phonetrack.fieldMap.batt).toBe("bat")
    expect(API_TEMPLATES.phonetrack.fieldMap.tst).toBe("timestamp")
    expect(API_TEMPLATES.phonetrack.fieldMap.bear).toBe("bearing")
  })

  it("traccar uses GET method", () => {
    expect(API_TEMPLATES.traccar.httpMethod).toBe("GET")
  })

  it("traccar maps fields for OsmAnd protocol", () => {
    expect(API_TEMPLATES.traccar.fieldMap.acc).toBe("accuracy")
    expect(API_TEMPLATES.traccar.fieldMap.alt).toBe("altitude")
    expect(API_TEMPLATES.traccar.fieldMap.vel).toBe("speed")
    expect(API_TEMPLATES.traccar.fieldMap.bs).toBe("charge")
    expect(API_TEMPLATES.traccar.fieldMap.tst).toBe("timestamp")
    expect(API_TEMPLATES.traccar.fieldMap.bear).toBe("bearing")
  })
})
