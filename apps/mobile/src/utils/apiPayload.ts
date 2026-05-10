/** Returns true when the active settings require Traccar JSON POST format. */
export function isTraccarJsonFormat(apiTemplate: string, httpMethod: string): boolean {
  return apiTemplate === "traccar" && httpMethod === "POST"
}

/** Returns true when the active settings require the Overland batch envelope. */
export function isOverlandFormat(apiTemplate: string, dawarichMode: string): boolean {
  return apiTemplate === "overland" || (apiTemplate === "dawarich" && dawarichMode === "batch")
}

/**
 * Builds a Dawarich/Overland batch envelope for the example payload preview.
 * Custom fields land at envelope level (matches the Overland iOS client).
 */
export function buildOverlandBatchPayload(params: {
  latitude: number
  longitude: number
  accuracy: number
  altitude: number
  speed: number
  course: number
  batteryLevel: number
  batteryState: "unknown" | "unplugged" | "charging" | "full"
  deviceId: string
  timestamp?: string
}): object {
  return {
    locations: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [params.longitude, params.latitude]
        },
        properties: {
          timestamp: params.timestamp ?? new Date().toISOString(),
          horizontal_accuracy: params.accuracy,
          altitude: params.altitude,
          speed: params.speed,
          course: params.course,
          battery_level: params.batteryLevel,
          battery_state: params.batteryState
        }
      }
    ],
    device_id: params.deviceId
  }
}

/**
 * Builds a Traccar JSON payload (Traccar 6.7.0+ OsmAnd POST format).
 * Used for both the example payload preview and the test connection request.
 */
export function buildTraccarJsonPayload(params: {
  latitude: number
  longitude: number
  accuracy: number
  altitude: number
  speed: number
  heading: number
  batteryLevel: number
  isCharging: boolean
  deviceId: string
  timestamp?: string
}): object {
  return {
    location: {
      timestamp: params.timestamp ?? new Date().toISOString(),
      coords: {
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy,
        altitude: params.altitude,
        speed: params.speed,
        heading: params.heading
      },
      battery: {
        level: params.batteryLevel,
        is_charging: params.isCharging
      }
    },
    device_id: params.deviceId
  }
}
