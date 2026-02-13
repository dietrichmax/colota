/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { LocationCoords } from "../types/global"

export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024 // 10 MB

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const getByteSize = (content: string): number => {
  return new Blob([content]).size
}

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
        coordinates: [item.longitude || 0, item.latitude || 0]
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
        <ele>${item.altitude || 0}</ele>
        <time>${isoTime}</time>
        <extensions>
          <accuracy>${item.accuracy || 0}</accuracy>
          <speed>${item.speed || 0}</speed>
          <battery>${item.battery || 0}</battery>
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
          ${data.map((item) => `${item.longitude},${item.latitude},${item.altitude || 0}`).join("\n          ")}
        </coordinates>
      </LineString>
    </Placemark>`

  data.forEach((item) => {
    const timestamp = item.timestamp ?? Date.now()
    const isoTime = new Date(timestamp).toISOString()
    kml += `
    <Placemark>
      <TimeStamp><when>${isoTime}</when></TimeStamp>
      <description>Accuracy: ${item.accuracy}m, Speed: ${item.speed}m/s</description>
      <Point>
        <coordinates>${item.longitude},${item.latitude},${item.altitude || 0}</coordinates>
      </Point>
    </Placemark>`
  })

  kml += `
  </Document>
</kml>`
  return kml
}
