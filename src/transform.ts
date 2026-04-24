import type { Target } from "./targets"

export interface ColotaPayload {
  lat: number
  lon: number
  acc: number
  batt: number
  bs: number
  tst: number
  alt?: number
  vel?: number // m/s
  bear?: number
  tid?: string // device/tracker identifier from app custom fields
}

export function owntracksToColota(body: Record<string, unknown>): ColotaPayload {
  return {
    lat: body.lat as number,
    lon: body.lon as number,
    acc: body.acc as number,
    batt: (body.batt as number) ?? 0,
    bs: (body.bs as number) ?? 0,
    tst: body.tst as number,
    ...(body.alt !== undefined && { alt: body.alt as number }),
    ...(body.vel !== undefined && { vel: body.vel as number }),
    ...(body.cog !== undefined && { bear: body.cog as number })
  }
}

export function transformPayload(payload: ColotaPayload, target: Target): Record<string, unknown> {
  switch (target.type) {
    case "owntracks":
      return {
        _type: "location",
        tid: payload.tid ?? target.tid ?? "CL",
        lat: payload.lat,
        lon: payload.lon,
        tst: payload.tst,
        acc: payload.acc,
        batt: payload.batt,
        bs: payload.bs,
        ...(payload.alt !== undefined && { alt: payload.alt }),
        ...(payload.vel !== undefined && { vel: payload.vel }),
        // OwnTracks uses "cog" for bearing
        ...(payload.bear !== undefined && { cog: payload.bear })
      }
    case "traccar":
      if (target.method === "POST") {
        // Traccar JSON POST format (Traccar 5.1+)
        const coords: Record<string, unknown> = {
          latitude: payload.lat,
          longitude: payload.lon,
          accuracy: payload.acc
        }
        if (payload.alt !== undefined) coords.altitude = payload.alt
        if (payload.vel !== undefined) coords.speed = payload.vel
        if (payload.bear !== undefined) coords.heading = payload.bear

        const location: Record<string, unknown> = {
          timestamp: new Date(payload.tst * 1000).toISOString(),
          coords
        }
        if (payload.batt !== undefined) {
          location.battery = {
            level: payload.batt / 100,
            is_charging: payload.bs === 2 || payload.bs === 3
          }
        }

        return {
          device_id: payload.tid ?? target.tid ?? "colota",
          location
        }
      }
      // Traccar OsmAnd GET format (default)
      return {
        id: payload.tid ?? target.tid ?? "colota",
        lat: payload.lat,
        lon: payload.lon,
        accuracy: payload.acc,
        timestamp: payload.tst,
        batt: payload.batt,
        charge: payload.bs,
        ...(payload.alt !== undefined && { altitude: payload.alt }),
        ...(payload.vel !== undefined && { speed: payload.vel }),
        ...(payload.bear !== undefined && { bearing: payload.bear })
      }
    default:
      return { ...payload }
  }
}
