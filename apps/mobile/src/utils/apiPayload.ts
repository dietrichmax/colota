/** Returns true when the active settings require Traccar JSON POST format. */
export function isTraccarJsonFormat(apiTemplate: string, httpMethod: string): boolean {
  return apiTemplate === "traccar" && httpMethod === "POST"
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
