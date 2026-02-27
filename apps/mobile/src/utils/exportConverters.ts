/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { type LucideIcon } from "lucide-react-native"
import { Table2, Globe, MapPin, Earth } from "lucide-react-native"
import { LocationCoords, Trip } from "../types/global"
import { getTripColor } from "./trips"

export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024 // 10 MB

/** Convert hex RGB (#RRGGBB) to KML's ABGR format (ffBBGGRR) */
function hexToKmlColor(hex: string): string {
  const h = hex.replace("#", "")
  return `ff${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const getByteSize = (content: string): number => {
  let bytes = 0
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i)
    if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate - pair encodes a 4-byte UTF-8 character
      bytes += 4
      i++ // skip the low surrogate
    } else {
      bytes += 3
    }
  }
  return bytes
}

// ============================================================================
// FLAT CONVERTERS (timestamps in milliseconds)
// ============================================================================

export const convertToCSV = (data: LocationCoords[]): string => {
  const headers = "id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery\n"
  const rows = data
    .map((item, i) => {
      const timestamp = item.timestamp ?? Date.now()
      const isoTime = new Date(timestamp).toISOString()
      return [
        i,
        item.timestamp,
        isoTime,
        item.latitude,
        item.longitude,
        item.accuracy,
        item.altitude ?? 0,
        item.speed ?? 0,
        item.battery ?? 0
      ].join(",")
    })
    .join("\n")
  return headers + rows
}

export const convertToGeoJSON = (data: LocationCoords[]): string => {
  const features = data.map((item, i) => {
    const timestamp = item.timestamp ? new Date(item.timestamp) : new Date()
    const timeStr = isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString()

    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [item.longitude ?? 0, item.latitude ?? 0]
      },
      properties: {
        id: i,
        accuracy: item.accuracy,
        altitude: item.altitude,
        speed: item.speed,
        battery: item.battery,
        time: timeStr
      }
    }
  })

  return JSON.stringify(
    {
      type: "FeatureCollection",
      features
    },
    null,
    2
  )
}

export const convertToGPX = (data: LocationCoords[]): string => {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Colota" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Colota Location Export</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>Colota Track Export</name>
    <trkseg>`

  data.forEach((item) => {
    const timestamp = item.timestamp ?? Date.now()
    const isoTime = new Date(timestamp).toISOString()
    gpx += `
      <trkpt lat="${item.latitude.toFixed(6)}" lon="${item.longitude.toFixed(6)}">
        <ele>${item.altitude ?? 0}</ele>
        <time>${isoTime}</time>
        <extensions>
          <accuracy>${item.accuracy ?? 0}</accuracy>
          <speed>${item.speed ?? 0}</speed>
          <battery>${item.battery ?? 0}</battery>
        </extensions>
      </trkpt>`
  })

  gpx += `
    </trkseg>
  </trk>
</gpx>`
  return gpx
}

export const convertToKML = (data: LocationCoords[]): string => {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Colota Location Export</name>
    <description>Exported tracks from Colota Tracking</description>
    <Style id="pathStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Track Path</name>
      <styleUrl>#pathStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${data.map((item) => `${item.longitude},${item.latitude},${item.altitude ?? 0}`).join("\n          ")}
        </coordinates>
      </LineString>
    </Placemark>`

  data.forEach((item) => {
    const timestamp = item.timestamp ?? Date.now()
    const isoTime = new Date(timestamp).toISOString()
    kml += `
    <Placemark>
      <TimeStamp><when>${isoTime}</when></TimeStamp>
      <description>Accuracy: ${item.accuracy}m, Speed: ${item.speed ?? 0}m/s</description>
      <Point>
        <coordinates>${item.longitude},${item.latitude},${item.altitude ?? 0}</coordinates>
      </Point>
    </Placemark>`
  })

  kml += `
  </Document>
</kml>`
  return kml
}

// ============================================================================
// TRIP-AWARE CONVERTERS (timestamps in Unix seconds)
// ============================================================================

export const convertTripsToCSV = (trips: Trip[]): string => {
  const headers = "trip,id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery\n"
  const rows = trips
    .flatMap((trip) =>
      trip.locations.map((item, i) => {
        const ts = item.timestamp ?? Math.floor(Date.now() / 1000)
        const isoTime = new Date(ts * 1000).toISOString()
        return [
          trip.index,
          i,
          ts,
          isoTime,
          item.latitude,
          item.longitude,
          item.accuracy ?? 0,
          item.altitude ?? 0,
          item.speed ?? 0,
          item.battery ?? 0
        ].join(",")
      })
    )
    .join("\n")
  return headers + rows
}

export const convertTripsToGeoJSON = (trips: Trip[]): string => {
  const features = trips.flatMap((trip) =>
    trip.locations.map((item, i) => {
      const ts = item.timestamp ?? Math.floor(Date.now() / 1000)
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [item.longitude || 0, item.latitude || 0]
        },
        properties: {
          trip: trip.index,
          id: i,
          accuracy: item.accuracy,
          altitude: item.altitude,
          speed: item.speed,
          battery: item.battery,
          time: new Date(ts * 1000).toISOString()
        }
      }
    })
  )
  return JSON.stringify({ type: "FeatureCollection", features }, null, 2)
}

export const convertTripsToGPX = (trips: Trip[]): string => {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Colota" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Colota Trip Export</name>
    <time>${new Date().toISOString()}</time>
  </metadata>`

  for (const trip of trips) {
    gpx += `
  <trk>
    <name>Trip ${trip.index}</name>
    <trkseg>`
    for (const item of trip.locations) {
      const ts = item.timestamp ?? Math.floor(Date.now() / 1000)
      gpx += `
      <trkpt lat="${item.latitude.toFixed(6)}" lon="${item.longitude.toFixed(6)}">
        <ele>${item.altitude || 0}</ele>
        <time>${new Date(ts * 1000).toISOString()}</time>
        <extensions>
          <accuracy>${item.accuracy || 0}</accuracy>
          <speed>${item.speed || 0}</speed>
          <battery>${item.battery || 0}</battery>
        </extensions>
      </trkpt>`
    }
    gpx += `
    </trkseg>
  </trk>`
  }

  gpx += `
</gpx>`
  return gpx
}

export const convertTripsToKML = (trips: Trip[]): string => {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Colota Trip Export</name>
    <description>Exported trips from Colota</description>`

  for (const trip of trips) {
    const styleId = `tripStyle${trip.index}`
    kml += `
    <Style id="${styleId}">
      <LineStyle>
        <color>${hexToKmlColor(getTripColor(trip.index))}</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Folder>
      <name>Trip ${trip.index}</name>
      <Placemark>
        <name>Trip ${trip.index} Path</name>
        <styleUrl>#${styleId}</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>
            ${trip.locations
              .map((item) => `${item.longitude},${item.latitude},${item.altitude || 0}`)
              .join("\n            ")}
          </coordinates>
        </LineString>
      </Placemark>`

    for (const item of trip.locations) {
      const ts = item.timestamp ?? Math.floor(Date.now() / 1000)
      kml += `
      <Placemark>
        <TimeStamp><when>${new Date(ts * 1000).toISOString()}</when></TimeStamp>
        <description>Trip ${trip.index} · Accuracy: ${item.accuracy ?? 0}m, Speed: ${item.speed ?? 0}m/s</description>
        <Point>
          <coordinates>${item.longitude},${item.latitude},${item.altitude || 0}</coordinates>
        </Point>
      </Placemark>`
    }

    kml += `
    </Folder>`
  }

  kml += `
  </Document>
</kml>`
  return kml
}

export const TRIP_CONVERTERS: Record<ExportFormat, (trips: Trip[]) => string> = {
  csv: convertTripsToCSV,
  geojson: convertTripsToGeoJSON,
  gpx: convertTripsToGPX,
  kml: convertTripsToKML
}

export type ExportFormat = "csv" | "geojson" | "gpx" | "kml"

export const EXPORT_FORMAT_KEYS: ExportFormat[] = ["csv", "geojson", "gpx", "kml"]

export interface ExportFormatConfig {
  label: string
  subtitle: string
  description: string
  icon: LucideIcon
  extension: string
  mimeType: string
  convert: (data: LocationCoords[]) => string
}

export const EXPORT_FORMATS: Record<ExportFormat, ExportFormatConfig> = {
  csv: {
    label: "CSV",
    subtitle: "Spreadsheet Format",
    description: "Excel, Google Sheets, data analysis",
    icon: Table2,
    extension: ".csv",
    mimeType: "text/csv",
    convert: convertToCSV
  },
  geojson: {
    label: "GeoJSON",
    subtitle: "Geographic Data",
    description: "Mapbox, Leaflet, QGIS, ArcGIS",
    icon: Globe,
    extension: ".geojson",
    mimeType: "application/json",
    convert: convertToGeoJSON
  },
  gpx: {
    label: "GPX",
    subtitle: "GPS Exchange",
    description: "Garmin, Strava, Google Earth",
    icon: MapPin,
    extension: ".gpx",
    mimeType: "application/gpx+xml",
    convert: convertToGPX
  },
  kml: {
    label: "KML",
    subtitle: "Keyhole Markup Language",
    description: "Google Earth, Google Maps, ArcGIS",
    icon: Earth,
    extension: ".kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    convert: convertToKML
  }
}
