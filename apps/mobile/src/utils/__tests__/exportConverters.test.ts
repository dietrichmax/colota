import { formatBytes } from "../format"
import {
  getByteSize,
  convertTripsToCSV,
  convertTripsToGeoJSON,
  convertTripsToGPX,
  convertTripsToKML,
  LARGE_FILE_THRESHOLD
} from "../exportConverters"

const sampleTrips = [
  {
    index: 1,
    locations: [
      { latitude: 48.137154, longitude: 11.576124, accuracy: 10, altitude: 520, speed: 1.5, timestamp: 1700000000 },
      { latitude: 48.138, longitude: 11.577, accuracy: 8, altitude: 525, speed: 2.0, timestamp: 1700000005 }
    ],
    startTime: 1700000000,
    endTime: 1700000005,
    distance: 120,
    locationCount: 2
  },
  {
    index: 2,
    locations: [{ latitude: 48.14, longitude: 11.58, accuracy: 12, altitude: 530, speed: 3.0, timestamp: 1700001000 }],
    startTime: 1700001000,
    endTime: 1700001000,
    distance: 0,
    locationCount: 1
  }
]

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(500)).toBe("500 B")
    expect(formatBytes(1023)).toBe("1023 B")
  })

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1536)).toBe("1.5 KB")
  })

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB")
    expect(formatBytes(1572864)).toBe("1.5 MB")
  })
})

describe("getByteSize", () => {
  it("returns correct size for ASCII string", () => {
    expect(getByteSize("hello")).toBe(5)
  })

  it("returns correct size for empty string", () => {
    expect(getByteSize("")).toBe(0)
  })

  it("handles multi-byte characters", () => {
    // UTF-8: ö = 2 bytes
    expect(getByteSize("ö")).toBeGreaterThan(1)
  })
})

describe("LARGE_FILE_THRESHOLD", () => {
  it("is 10 MB", () => {
    expect(LARGE_FILE_THRESHOLD).toBe(10 * 1024 * 1024)
  })
})

describe("convertTripsToCSV", () => {
  it("includes trip column in header", () => {
    const csv = convertTripsToCSV([])
    expect(csv).toContain("trip,id,timestamp")
  })

  it("includes trip index per row", () => {
    const csv = convertTripsToCSV(sampleTrips)
    const lines = csv.split("\n")
    expect(lines[1]).toMatch(/^1,/) // trip 1
    expect(lines[3]).toMatch(/^2,/) // trip 2
  })

  it("flattens all trip locations into rows", () => {
    const csv = convertTripsToCSV(sampleTrips)
    const lines = csv.split("\n")
    expect(lines).toHaveLength(4) // header + 3 locations
  })

  it("uses Unix seconds for timestamps", () => {
    const csv = convertTripsToCSV(sampleTrips)
    expect(csv).toContain("1700000000")
  })
})

describe("convertTripsToGeoJSON", () => {
  it("returns valid FeatureCollection", () => {
    const result = JSON.parse(convertTripsToGeoJSON(sampleTrips))
    expect(result.type).toBe("FeatureCollection")
    expect(result.features).toHaveLength(3)
  })

  it("includes trip index in properties", () => {
    const result = JSON.parse(convertTripsToGeoJSON(sampleTrips))
    expect(result.features[0].properties.trip).toBe(1)
    expect(result.features[2].properties.trip).toBe(2)
  })

  it("uses [lon, lat] coordinate order", () => {
    const result = JSON.parse(convertTripsToGeoJSON(sampleTrips))
    const coords = result.features[0].geometry.coordinates
    expect(coords[0]).toBe(11.576124)
    expect(coords[1]).toBe(48.137154)
  })
})

describe("convertTripsToGPX", () => {
  it("creates separate trk elements per trip", () => {
    const gpx = convertTripsToGPX(sampleTrips)
    expect(gpx).toContain("<name>Trip 1</name>")
    expect(gpx).toContain("<name>Trip 2</name>")
    const trkCount = (gpx.match(/<trk>/g) || []).length
    expect(trkCount).toBe(2)
  })

  it("includes trackpoints with lat/lon", () => {
    const gpx = convertTripsToGPX(sampleTrips)
    expect(gpx).toContain('lat="48.137154"')
    expect(gpx).toContain('lon="11.576124"')
  })

  it("includes elevation and extensions", () => {
    const gpx = convertTripsToGPX(sampleTrips)
    expect(gpx).toContain("<ele>520</ele>")
    expect(gpx).toContain("<accuracy>10</accuracy>")
  })
})

describe("convertTripsToKML", () => {
  it("creates separate folders per trip", () => {
    const kml = convertTripsToKML(sampleTrips)
    expect(kml).toContain("<name>Trip 1</name>")
    expect(kml).toContain("<name>Trip 2</name>")
    const folderCount = (kml.match(/<Folder>/g) || []).length
    expect(folderCount).toBe(2)
  })

  it("uses per-trip colors", () => {
    const kml = convertTripsToKML(sampleTrips)
    // Trip 1: #3B82F6 -> ABGR ffF6823B
    expect(kml).toContain("ffF6823B")
    // Trip 2: #10B981 -> ABGR ff81B910
    expect(kml).toContain("ff81B910")
  })

  it("includes LineString coordinates per trip", () => {
    const kml = convertTripsToKML(sampleTrips)
    expect(kml).toContain("11.576124,48.137154,520")
    expect(kml).toContain("11.58,48.14,530")
  })

  it("includes Placemarks with trip labels", () => {
    const kml = convertTripsToKML(sampleTrips)
    expect(kml).toContain("Trip 1")
    expect(kml).toContain("Trip 2")
    expect(kml).toContain("<TimeStamp>")
  })
})
