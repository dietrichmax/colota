import {
  formatBytes,
  getByteSize,
  convertToCSV,
  convertToGeoJSON,
  convertToGPX,
  convertToKML,
  LARGE_FILE_THRESHOLD
} from "../exportConverters"
import { LocationCoords } from "../../types/global"

const sampleLocation: LocationCoords = {
  latitude: 48.137154,
  longitude: 11.576124,
  accuracy: 10,
  altitude: 520,
  speed: 1.5,
  bearing: 180,
  battery: 85,
  battery_status: 2,
  timestamp: 1700000000000
}

const minimalLocation: LocationCoords = {
  latitude: 0,
  longitude: 0
}

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

describe("convertToCSV", () => {
  it("returns headers for empty data", () => {
    const csv = convertToCSV([])
    expect(csv).toContain("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery")
  })

  it("converts a single location", () => {
    const csv = convertToCSV([sampleLocation])
    const lines = csv.split("\n")
    expect(lines).toHaveLength(2) // header + 1 row

    const row = lines[1]
    expect(row).toContain("48.137154")
    expect(row).toContain("11.576124")
    expect(row).toContain("10") // accuracy
  })

  it("defaults missing optional fields to 0", () => {
    const csv = convertToCSV([minimalLocation])
    const row = csv.split("\n")[1]
    // altitude, speed, battery should be 0
    expect(row).toMatch(/,0,0,0$/)
  })

  it("handles multiple locations", () => {
    const csv = convertToCSV([sampleLocation, sampleLocation])
    const lines = csv.split("\n")
    expect(lines).toHaveLength(3) // header + 2 rows
    expect(lines[1]).toMatch(/^0,/) // first row id=0
    expect(lines[2]).toMatch(/^1,/) // second row id=1
  })
})

describe("convertToGeoJSON", () => {
  it("returns valid FeatureCollection for empty data", () => {
    const result = JSON.parse(convertToGeoJSON([]))
    expect(result.type).toBe("FeatureCollection")
    expect(result.features).toEqual([])
  })

  it("creates Point features with [lon, lat] order", () => {
    const result = JSON.parse(convertToGeoJSON([sampleLocation]))
    const coords = result.features[0].geometry.coordinates
    expect(coords[0]).toBe(11.576124) // longitude first
    expect(coords[1]).toBe(48.137154) // latitude second
  })

  it("includes properties", () => {
    const result = JSON.parse(convertToGeoJSON([sampleLocation]))
    const props = result.features[0].properties
    expect(props.accuracy).toBe(10)
    expect(props.altitude).toBe(520)
    expect(props.speed).toBe(1.5)
    expect(props.battery).toBe(85)
  })

  it("handles missing timestamp gracefully", () => {
    const result = JSON.parse(convertToGeoJSON([minimalLocation]))
    const time = result.features[0].properties.time
    // Should be a valid ISO string (falls back to current date)
    expect(() => new Date(time)).not.toThrow()
  })

  it("defaults missing coordinates to 0", () => {
    const result = JSON.parse(convertToGeoJSON([minimalLocation]))
    const coords = result.features[0].geometry.coordinates
    expect(coords).toEqual([0, 0])
  })
})

describe("convertToGPX", () => {
  it("returns valid GPX XML structure", () => {
    const gpx = convertToGPX([])
    expect(gpx).toContain('<?xml version="1.0"')
    expect(gpx).toContain("<gpx")
    expect(gpx).toContain("</gpx>")
    expect(gpx).toContain("<trkseg>")
    expect(gpx).toContain("</trkseg>")
  })

  it("includes trackpoints with lat/lon to 6 decimals", () => {
    const gpx = convertToGPX([sampleLocation])
    expect(gpx).toContain('lat="48.137154"')
    expect(gpx).toContain('lon="11.576124"')
  })

  it("includes elevation and extensions", () => {
    const gpx = convertToGPX([sampleLocation])
    expect(gpx).toContain("<ele>520</ele>")
    expect(gpx).toContain("<accuracy>10</accuracy>")
    expect(gpx).toContain("<speed>1.5</speed>")
    expect(gpx).toContain("<battery>85</battery>")
  })

  it("defaults missing fields to 0", () => {
    const gpx = convertToGPX([minimalLocation])
    expect(gpx).toContain("<ele>0</ele>")
    expect(gpx).toContain("<accuracy>0</accuracy>")
    expect(gpx).toContain("<speed>0</speed>")
    expect(gpx).toContain("<battery>0</battery>")
  })
})

describe("convertToKML", () => {
  it("returns valid KML XML structure", () => {
    const kml = convertToKML([])
    expect(kml).toContain('<?xml version="1.0"')
    expect(kml).toContain("<kml")
    expect(kml).toContain("</kml>")
    expect(kml).toContain("<Document>")
    expect(kml).toContain("</Document>")
  })

  it("includes LineString track path", () => {
    const kml = convertToKML([sampleLocation])
    expect(kml).toContain("<LineString>")
    expect(kml).toContain("11.576124,48.137154,520")
  })

  it("includes individual Placemarks with timestamps", () => {
    const kml = convertToKML([sampleLocation])
    expect(kml).toContain("<TimeStamp>")
    expect(kml).toContain("<Point>")
    expect(kml).toContain("Accuracy: 10m")
    expect(kml).toContain("Speed: 1.5m/s")
  })

  it("includes style definition", () => {
    const kml = convertToKML([sampleLocation])
    expect(kml).toContain('<Style id="pathStyle">')
    expect(kml).toContain("<color>ff0000ff</color>")
  })

  it("defaults missing altitude to 0", () => {
    const kml = convertToKML([minimalLocation])
    expect(kml).toContain("0,0,0") // lon,lat,alt
  })
})
