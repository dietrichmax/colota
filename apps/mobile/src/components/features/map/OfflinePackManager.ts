/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { OfflineManager } from "@maplibre/maplibre-react-native"
import { radiusToBounds } from "../../../utils/geo"
import { MAP_STYLE_URL } from "../../../constants"
import NativeLocationService from "../../../services/NativeLocationService"
const MIN_ZOOM = 8
// Road tiles cover denser urban/suburban areas (~5 KB avg); trail tiles cover mixed
// terrain (~3 KB avg). Both are upper-leaning estimates.
const BYTES_PER_TILE: Record<string, number> = {
  road: 5 * 1024,
  trail: 3 * 1024
}
const TILE_COUNT_LIMIT = 100_000

export const MAX_OFFLINE_RADIUS_M = 100_000 // 100 km / ~62 mi

export type OfflineDetailLevel = "road" | "trail"

const DETAIL_MAX_ZOOM: Record<OfflineDetailLevel, number> = {
  road: 14,
  trail: 16
}

export const DETAIL_LABELS: Record<OfflineDetailLevel, string> = {
  road: "Standard",
  trail: "Hiking"
}

export const DETAIL_SUBLABELS: Record<OfflineDetailLevel, string> = {
  road: "Roads & towns",
  trail: "Trails & paths"
}

// state values from MapLibre's OfflinePackDownloadState
export const DOWNLOAD_STATE = {
  INACTIVE: 0,
  ACTIVE: 1,
  COMPLETE: 2,
  FAILED: 3
} as const

export interface OfflinePackStatus {
  state: number
  percentage: number
  completedResourceCount: number
  requiredResourceCount: number
  completedResourceSize: number
}

export interface OfflineAreaInfo {
  name: string
  sizeBytes: number | null
  isComplete: boolean
  isActive: boolean
}

function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z))
}

function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z))
}

function estimateTileCount(lat: number, radiusMeters: number, maxZoom: number): number {
  // lon=0: tile count depends only on bounding box width (a function of lat), not absolute longitude
  const [[east, north], [west, south]] = radiusToBounds(lat, 0, radiusMeters)

  let total = 0
  for (let z = MIN_ZOOM; z <= maxZoom; z++) {
    const xMin = lonToTileX(west, z)
    const xMax = lonToTileX(east, z)
    const yMin = latToTileY(north, z)
    const yMax = latToTileY(south, z)
    total += (xMax - xMin + 1) * (yMax - yMin + 1)
  }
  return total
}

/** Returns true if the area would hit the tile count cap, meaning coverage will be incomplete. */
export function willExceedTileLimit(lat: number, radiusMeters: number, detail: OfflineDetailLevel): boolean {
  return estimateTileCount(lat, radiusMeters, DETAIL_MAX_ZOOM[detail]) >= TILE_COUNT_LIMIT
}

/**
 * Returns a human-readable estimated download size string (e.g. "~45 MB").
 * Pass the user's actual latitude for best accuracy - tile rows widen at higher latitudes.
 */
export function estimateSizeLabel(lat: number, radiusMeters: number, detail: OfflineDetailLevel): string {
  const tiles = Math.min(estimateTileCount(lat, radiusMeters, DETAIL_MAX_ZOOM[detail]), TILE_COUNT_LIMIT)
  const mb = (tiles * BYTES_PER_TILE[detail]) / (1024 * 1024)
  if (mb < 1) return `~${(mb * 1024).toFixed(0)} KB`
  if (mb >= 1000) return `~${(mb / 1024).toFixed(1)} GB`
  return `~${mb.toFixed(0)} MB`
}

/** Returns the estimated download size in bytes. */
export function estimateSizeBytes(lat: number, radiusMeters: number, detail: OfflineDetailLevel): number {
  const tiles = Math.min(estimateTileCount(lat, radiusMeters, DETAIL_MAX_ZOOM[detail]), TILE_COUNT_LIMIT)
  return tiles * BYTES_PER_TILE[detail]
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function createOfflinePack(
  name: string,
  lat: number,
  lon: number,
  radiusMeters: number,
  detail: OfflineDetailLevel,
  onProgress: (status: OfflinePackStatus) => void,
  onError: (err: unknown) => void
): Promise<void> {
  OfflineManager.setTileCountLimit(TILE_COUNT_LIMIT)
  const bounds = radiusToBounds(lat, lon, radiusMeters)
  const maxZoom = DETAIL_MAX_ZOOM[detail]

  await OfflineManager.createPack(
    { name, styleURL: MAP_STYLE_URL, minZoom: MIN_ZOOM, maxZoom, bounds },
    (_pack: unknown, status: OfflinePackStatus) => onProgress(status),
    (_pack: unknown, err: unknown) => onError(err)
  )
}

export async function loadOfflineAreas(): Promise<OfflineAreaInfo[]> {
  const packs = await OfflineManager.getPacks()

  const namedPacks = packs.filter((p): p is typeof p & { name: string } => !!p.name)

  return Promise.all(
    namedPacks.map(async (pack) => {
      try {
        const status = await pack.status()
        return {
          name: pack.name,
          sizeBytes: status?.completedResourceSize ?? null,
          isComplete: status?.state === DOWNLOAD_STATE.COMPLETE,
          isActive: status?.state === DOWNLOAD_STATE.ACTIVE
        } satisfies OfflineAreaInfo
      } catch {
        return { name: pack.name, sizeBytes: null, isComplete: false, isActive: false } satisfies OfflineAreaInfo
      }
    })
  )
}

/** Stops any active download for the pack, removes it and its tiles from disk, and clears the ambient tile cache. */
export async function deleteOfflineArea(name: string): Promise<void> {
  OfflineManager.unsubscribe(name)
  const pack = await OfflineManager.getPack(name)
  if (pack) {
    try {
      await pack.pause()
    } catch {
      // pack may already be inactive - proceed to delete
    }
    await OfflineManager.deletePack(name)
  }
  await OfflineManager.clearAmbientCache()
}

export function unsubscribeOfflinePack(name: string): void {
  OfflineManager.unsubscribe(name)
}

// ---------------------------------------------------------------------------
// Bounds persistence - stored as JSON in the settings table
// ---------------------------------------------------------------------------

const BOUNDS_KEY = "offline_area_bounds"

export interface OfflineAreaBounds {
  name: string
  lat: number
  lon: number
  radiusMeters: number
}

export async function loadOfflineAreaBounds(): Promise<OfflineAreaBounds[]> {
  try {
    const json = await NativeLocationService.getSetting(BOUNDS_KEY, "[]")
    return JSON.parse(json ?? "[]") as OfflineAreaBounds[]
  } catch {
    return []
  }
}

export async function saveOfflineAreaBounds(entry: OfflineAreaBounds): Promise<void> {
  const existing = await loadOfflineAreaBounds()
  const updated = [...existing.filter((b) => b.name !== entry.name), entry]
  await NativeLocationService.saveSetting(BOUNDS_KEY, JSON.stringify(updated))
}

export async function removeOfflineAreaBounds(name: string): Promise<void> {
  const existing = await loadOfflineAreaBounds()
  const updated = existing.filter((b) => b.name !== name)
  await NativeLocationService.saveSetting(BOUNDS_KEY, JSON.stringify(updated))
}
