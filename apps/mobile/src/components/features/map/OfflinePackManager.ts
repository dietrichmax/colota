/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { OfflineManager, type OfflinePack } from "@maplibre/maplibre-react-native"
import { MAP_STYLE_URL_LIGHT as MAP_STYLE_URL } from "../../../constants"
import NativeLocationService from "../../../services/NativeLocationService"
import { logger } from "../../../utils/logger"
import { formatBytes } from "../../../utils/format"

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
  /** Null when the pack's status could not be read, which is not the same as an empty pack. */
  sizeBytes: number | null
  isComplete: boolean
  isActive: boolean
  /** `[west, south, east, north]` as the pack stores it; null only when native gave none. */
  bounds: [number, number, number, number] | null
}

function boundsOf(pack: OfflinePack): OfflineAreaInfo["bounds"] {
  const b = pack.bounds as unknown
  return Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number")
    ? (b as [number, number, number, number])
    : null
}

/** Only the terminal state is worth a line; progress fires continuously. */
function progressListener(name: string, onProgress: (status: OfflinePackStatus) => void) {
  return (_pack: unknown, status: unknown) => {
    const s = status as OfflinePackStatus
    if (s.state === DOWNLOAD_STATE.COMPLETE) {
      logger.info(`[OfflinePackManager] Download complete: '${name}', ${formatBytes(s.completedResourceSize ?? 0)}`)
    }
    onProgress(s)
  }
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

  logger.info(`[OfflinePackManager] Downloading '${name}': z${MIN_ZOOM}-${MAX_ZOOM}, ${estimateSizeLabel(ne, sw)}`)

  await OfflineManager.createPack(
    {
      mapStyle,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      bounds: [sw[0], sw[1], ne[0], ne[1]],
      metadata: { name }
    },
    progressListener(name, onProgress),
    (_pack, err) => onError(err)
  )
}

/**
 * Re-attaches to a download this JS instance did not start, and returns where it stands. Observing
 * a pack sets it active natively, so this is only for a pack native already reports as active: on
 * anything else it would start a download nobody asked for.
 */
export async function subscribeOfflinePack(
  name: string,
  onProgress: (status: OfflinePackStatus) => void,
  onError: (err: unknown) => void
): Promise<OfflinePackStatus | null> {
  const pack = await findPackByName(name)
  if (!pack) return null
  const status = (await pack.status()) as OfflinePackStatus
  await OfflineManager.addListener(pack.id, progressListener(name, onProgress), (_pack, err) => onError(err))
  logger.info(`[OfflinePackManager] Re-attached to '${name}' at ${Math.round(status.percentage)}%`)
  return status
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
          isActive: status?.state === DOWNLOAD_STATE.ACTIVE,
          bounds: boundsOf(pack)
        }
      } catch (err) {
        logger.warn(`[OfflinePackManager] Status unreadable for pack '${name}':`, err)
        return { name, sizeBytes: null, isComplete: false, isActive: false, bounds: boundsOf(pack) }
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
    logger.info(`[OfflinePackManager] Deleted offline area '${name}'`)
  } else {
    logger.debug(`[OfflinePackManager] No pack named '${name}' to delete`)
  }

  // SQLite does not shrink the database file when rows are deleted - freed pages
  // stay allocated until the database is recreated. If this was the last pack,
  // reset the database so the OS reclaims the storage space.
  const remaining = await OfflineManager.getPacks()
  if (remaining.length === 0) {
    logger.info("[OfflinePackManager] Last area removed, resetting the tile database to reclaim space")
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
  downloadedAt?: number // Unix ms, set when the download completes
}

/** Reads the stored list. Throws when it cannot be read, so a writer can tell empty from failed. */
async function readOfflineAreaBoundsOrThrow(): Promise<OfflineAreaBounds[]> {
  // A rejection here means the value is intact but unreachable, so a writer must not overwrite it.
  const json = await NativeLocationService.getSetting(BOUNDS_KEY, "[]")

  let parsed: unknown[]
  try {
    parsed = JSON.parse(json ?? "[]") as unknown[]
  } catch (err) {
    // Unrecoverable either way, so refusing would leave the key unwritable for good. Repair it.
    logger.warn("[OfflinePackManager] Stored area bounds are malformed, starting a fresh list:", err)
    return []
  }
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
}

/** Display path: an unreadable list shows as empty, since there is nothing to render either way. */
export async function loadOfflineAreaBounds(): Promise<OfflineAreaBounds[]> {
  try {
    return await readOfflineAreaBoundsOrThrow()
  } catch (err) {
    logger.error("[OfflinePackManager] Failed to read saved area bounds:", err)
    return []
  }
}

export async function saveOfflineAreaBounds(entry: OfflineAreaBounds): Promise<void> {
  let existing: OfflineAreaBounds[]
  try {
    existing = await readOfflineAreaBoundsOrThrow()
  } catch (err) {
    logger.error(
      `[OfflinePackManager] Not saving bounds for '${entry.name}': stored list unreadable, so the area will not be re-downloadable after a restart:`,
      err
    )
    return
  }
  const updated = [...existing.filter((b) => b.name !== entry.name), entry]
  await NativeLocationService.saveSetting(BOUNDS_KEY, JSON.stringify(updated))
}

export async function removeOfflineAreaBounds(name: string): Promise<void> {
  let existing: OfflineAreaBounds[]
  try {
    existing = await readOfflineAreaBoundsOrThrow()
  } catch (err) {
    logger.error(`[OfflinePackManager] Not removing bounds for '${name}', stored list unreadable:`, err)
    return
  }
  const updated = existing.filter((b) => b.name !== name)
  await NativeLocationService.saveSetting(BOUNDS_KEY, JSON.stringify(updated))
}

/** Drops entries whose pack is gone, in one write, so a list of orphans cannot race itself. */
export async function pruneOfflineAreaBounds(keep: ReadonlySet<string>): Promise<void> {
  let existing: OfflineAreaBounds[]
  try {
    existing = await readOfflineAreaBoundsOrThrow()
  } catch (err) {
    logger.error("[OfflinePackManager] Not pruning bounds, stored list unreadable:", err)
    return
  }
  const kept = existing.filter((b) => keep.has(b.name))
  if (kept.length === existing.length) return
  await NativeLocationService.saveSetting(BOUNDS_KEY, JSON.stringify(kept))
}
