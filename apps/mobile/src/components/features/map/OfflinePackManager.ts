/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { OfflineManager, type OfflinePack } from "@maplibre/maplibre-react-native"
import { MAP_STYLE_URL_LIGHT as MAP_STYLE_URL } from "../../../constants"
import NativeLocationService from "../../../services/NativeLocationService"

const MIN_ZOOM = 8
const MAX_ZOOM = 14 // mxd.codes / OpenFreeMap caps vector tiles at z14
const TILE_COUNT_LIMIT = 100_000

// Per-zoom size buckets based on observed mxd.codes vector tile sizes.
// Low-zoom tiles contain fewer features; high-zoom tiles grow significantly.
function bytesPerTile(z: number): number {
  if (z < 10) return 10 * 1024
  if (z < 14) return 25 * 1024
  return 50 * 1024
}

// state values from MapLibre's OfflinePackDownloadState (v11 uses string literals)
export const DOWNLOAD_STATE = {
  INACTIVE: "inactive",
  ACTIVE: "active",
  COMPLETE: "complete"
} as const

export interface OfflinePackStatus {
  state: string
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
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z)
}

function estimateTileCount(ne: [number, number], sw: [number, number]): number {
  const [eLon, nLat] = ne
  const [wLon, sLat] = sw
  let total = 0
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const xMin = lonToTileX(wLon, z)
    const xMax = lonToTileX(eLon, z)
    const yMin = latToTileY(nLat, z)
    const yMax = latToTileY(sLat, z)
    total += (xMax - xMin + 1) * (yMax - yMin + 1)
  }
  return total
}

/** Returns true if the area would hit the tile count cap, meaning coverage will be incomplete. */
export function willExceedTileLimit(ne: [number, number], sw: [number, number]): boolean {
  return estimateTileCount(ne, sw) >= TILE_COUNT_LIMIT
}

/** Returns the estimated download size in bytes, using per-zoom tile size buckets. */
export function estimateSizeBytes(ne: [number, number], sw: [number, number]): number {
  const [eLon, nLat] = ne
  const [wLon, sLat] = sw
  let remainingTiles = TILE_COUNT_LIMIT
  let totalBytes = 0
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const tilesAtZ = Math.min(
      (lonToTileX(eLon, z) - lonToTileX(wLon, z) + 1) * (latToTileY(sLat, z) - latToTileY(nLat, z) + 1),
      remainingTiles
    )
    totalBytes += tilesAtZ * bytesPerTile(z)
    remainingTiles -= tilesAtZ
    if (remainingTiles <= 0) break
  }
  return totalBytes
}

/** Returns a human-readable estimated download size string (e.g. "~45 MB"). */
export function estimateSizeLabel(ne: [number, number], sw: [number, number]): string {
  const mb = estimateSizeBytes(ne, sw) / (1024 * 1024)
  if (mb < 1) return `~${(mb * 1024).toFixed(0)} KB`
  if (mb >= 1000) return `~${(mb / 1024).toFixed(1)} GB`
  return `~${mb.toFixed(0)} MB`
}

/** Finds a pack by its stored metadata.name (packs are identified by UUID in v11). */
async function findPackByName(name: string): Promise<OfflinePack | null> {
  const packs = await OfflineManager.getPacks()
  return packs.find((p) => (p.metadata as { name?: string })?.name === name) ?? null
}

export async function createOfflinePack(
  name: string,
  ne: [number, number],
  sw: [number, number],
  onProgress: (status: OfflinePackStatus) => void,
  onError: (err: unknown) => void
): Promise<void> {
  const existing = await findPackByName(name)
  if (existing) throw new Error(`An offline area named "${name}" already exists`)

  const customStyleUrl = await NativeLocationService.getSetting("mapStyleUrlLight")
  const mapStyle = customStyleUrl || MAP_STYLE_URL

  OfflineManager.setTileCountLimit(TILE_COUNT_LIMIT)

  await OfflineManager.createPack(
    {
      mapStyle,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      bounds: [sw[0], sw[1], ne[0], ne[1]],
      metadata: { name }
    },
    (_pack, status) => onProgress(status as OfflinePackStatus),
    (_pack, err) => onError(err)
  )
}

export async function loadOfflineAreas(): Promise<OfflineAreaInfo[]> {
  const packs = await OfflineManager.getPacks()

  const results = await Promise.all(
    packs.map(async (pack): Promise<OfflineAreaInfo | null> => {
      const name = (pack.metadata as { name?: string })?.name
      if (!name) return null
      try {
        const status = await pack.status()
        return {
          name,
          sizeBytes: status?.completedResourceSize ?? null,
          isComplete: status?.state === DOWNLOAD_STATE.COMPLETE,
          isActive: status?.state === DOWNLOAD_STATE.ACTIVE
        }
      } catch {
        return { name, sizeBytes: null, isComplete: false, isActive: false }
      }
    })
  )
  return results.filter((r): r is OfflineAreaInfo => r !== null)
}

/** Stops any active download for the pack and removes it and its tiles from disk. */
export async function deleteOfflineArea(name: string): Promise<void> {
  const pack = await findPackByName(name)
  if (pack) {
    OfflineManager.removeListener(pack.id)
    try {
      await pack.pause()
    } catch {
      // pack may already be inactive - proceed to delete
    }
    await OfflineManager.deletePack(pack.id)
  }

  // SQLite does not shrink the database file when rows are deleted - freed pages
  // stay allocated until the database is recreated. If this was the last pack,
  // reset the database so the OS reclaims the storage space.
  const remaining = await OfflineManager.getPacks()
  if (remaining.length === 0) {
    await OfflineManager.resetDatabase()
  }
}

export async function unsubscribeOfflinePack(name: string): Promise<void> {
  const pack = await findPackByName(name)
  if (pack) OfflineManager.removeListener(pack.id)
}

// ---------------------------------------------------------------------------
// Bounds persistence - stored as JSON in the settings table
// ---------------------------------------------------------------------------

const BOUNDS_KEY = "offline_area_bounds"

export interface OfflineAreaBounds {
  name: string
  ne: [number, number] // [lon, lat]
  sw: [number, number] // [lon, lat]
  styleUrl?: string
  downloadedAt?: number // Unix ms timestamp set when download starts
}

export async function loadOfflineAreaBounds(): Promise<OfflineAreaBounds[]> {
  try {
    const json = await NativeLocationService.getSetting(BOUNDS_KEY, "[]")
    const parsed = JSON.parse(json ?? "[]") as unknown[]
    // Filter out entries from the old schema (lat/lon/radiusMeters) that lack ne/sw
    return parsed.filter(
      (b): b is OfflineAreaBounds =>
        typeof b === "object" &&
        b !== null &&
        "ne" in b &&
        "sw" in b &&
        Array.isArray((b as OfflineAreaBounds).ne) &&
        Array.isArray((b as OfflineAreaBounds).sw)
    )
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
