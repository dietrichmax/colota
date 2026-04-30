/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react"
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator, AppState } from "react-native"
import { GeoJSONSource, Layer, type PressEventWithFeatures } from "@maplibre/maplibre-react-native"
import type { NativeSyntheticEvent } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { showAlert, showConfirm } from "../services/modalService"
import { ScreenProps } from "../types/global"
import { useCoords } from "../contexts/TrackingProvider"
import { fonts } from "../styles/typography"
import { X, CheckCircle, RefreshCw, AlertTriangle } from "lucide-react-native"
import { Container, SectionTitle, Card } from "../components"
import { useFocusEffect } from "@react-navigation/native"
import { DEFAULT_MAP_ZOOM, WORLD_MAP_ZOOM, MAP_ANIMATION_DURATION_MS, MAP_STYLE_URL_LIGHT } from "../constants"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { logger } from "../utils/logger"
import NativeLocationService from "../services/NativeLocationService"
import { formatBytes } from "../utils/format"
import {
  createOfflinePack,
  loadOfflineAreas,
  deleteOfflineArea,
  unsubscribeOfflinePack,
  DOWNLOAD_STATE,
  OfflinePackStatus,
  OfflineAreaInfo,
  OfflineAreaBounds,
  estimateSizeLabel,
  estimateSizeBytes,
  willExceedTileLimit,
  loadOfflineAreaBounds,
  saveOfflineAreaBounds,
  removeOfflineAreaBounds
} from "../components/features/map/OfflinePackManager"

type ItemAction = { area: string; action: "deleting" | "canceling" | "refreshing" }
type ThemeColors = ReturnType<typeof useTheme>["colors"]

function formatRelativeTime(timestamp: number): string {
  const diffDays = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24))
  if (diffDays < 1) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 14) return `${diffDays} days ago`
  if (diffDays < 60) return `${Math.floor(diffDays / 7)} weeks ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", year: "numeric" })
}

// ---------------------------------------------------------------------------
// DownloadForm
// ---------------------------------------------------------------------------

interface DownloadFormProps {
  colors: ThemeColors
  estimatedSizeLabel: string | null
  downloading: boolean
  downloadProgress: OfflinePackStatus | null
  downloadError: string | null
  areasCount: number
  totalStorageBytes: number
  nameInputRef: React.RefObject<TextInput | null>
  onNameChange: (v: string) => void
  onDownload: () => void
  onCancelDownload: () => void
}

const DownloadForm = memo(
  ({
    colors,
    estimatedSizeLabel,
    downloading,
    downloadProgress,
    downloadError,
    areasCount,
    totalStorageBytes,
    nameInputRef,
    onNameChange,
    onDownload,
    onCancelDownload
  }: DownloadFormProps) => {
    const progressPct = downloadProgress?.percentage ?? 0
    const progressLabel =
      downloadProgress?.state === DOWNLOAD_STATE.COMPLETE
        ? "Complete"
        : downloadProgress
          ? `${Math.round(progressPct)}%`
          : "Starting..."

    const sizeLabel = useMemo(() => {
      if (!downloadProgress || downloadProgress.completedResourceSize <= 0) return null
      const {
        completedResourceSize: done,
        completedResourceCount: count,
        requiredResourceCount: total
      } = downloadProgress
      const downloaded = formatBytes(done)
      if (count > 0 && total > 0) return `${downloaded} / ~${formatBytes((done / count) * total)}`
      return downloaded
    }, [downloadProgress])

    return (
      <>
        <View style={styles.section}>
          <SectionTitle>Download Area</SectionTitle>
          <Card>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Pan and zoom the map to frame the area you want to download, then enter a name and tap Download. Size
              estimates may be significantly higher in dense urban areas.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                ref={nameInputRef}
                style={[
                  styles.input,
                  { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
                ]}
                placeholder="Home area, Trail..."
                placeholderTextColor={colors.placeholder}
                onChangeText={onNameChange}
                editable={!downloading}
              />
            </View>

            {estimatedSizeLabel && (
              <Text style={[styles.sizeEstimate, { color: colors.textSecondary }]}>{estimatedSizeLabel} estimated</Text>
            )}

            {downloading ? (
              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.progressLabel, { color: colors.text }]}>Downloading {progressLabel}</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progressPct}%` }]} />
                </View>
                {downloadProgress && (
                  <Text style={[styles.progressSub, { color: colors.textSecondary }]}>
                    {downloadProgress.completedResourceCount} / {downloadProgress.requiredResourceCount} resources
                    {sizeLabel ? ` - ${sizeLabel}` : ""}
                  </Text>
                )}
                <Pressable
                  testID="cancel-download-btn"
                  onPress={onCancelDownload}
                  style={({ pressed }) => [
                    styles.cancelBtn,
                    { borderColor: colors.error + "40" },
                    pressed && { opacity: colors.pressedOpacity }
                  ]}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.error }]}>Cancel Download</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                testID="download-btn"
                style={({ pressed }) => [
                  styles.downloadBtn,
                  { backgroundColor: estimatedSizeLabel ? colors.primary : colors.border },
                  pressed && { opacity: colors.pressedOpacity }
                ]}
                onPress={onDownload}
                disabled={!estimatedSizeLabel}
              >
                <Text style={[styles.downloadBtnText, { color: colors.textOnPrimary }]}>Download Area</Text>
              </Pressable>
            )}

            {downloadError && <Text style={[styles.errorText, { color: colors.error }]}>{downloadError}</Text>}
          </Card>
        </View>

        {areasCount > 0 && (
          <>
            <SectionTitle>Saved Areas</SectionTitle>
            {totalStorageBytes > 0 && (
              <Text style={[styles.savedAreasMeta, { color: colors.textSecondary }]}>
                {areasCount} {areasCount === 1 ? "area" : "areas"} · {formatBytes(totalStorageBytes)}
              </Text>
            )}
          </>
        )}
      </>
    )
  }
)

// ---------------------------------------------------------------------------
// OfflineMapsScreen
// ---------------------------------------------------------------------------

export function OfflineMapsScreen({}: ScreenProps) {
  const coords = useCoords()
  const { colors } = useTheme()

  const [areas, setAreas] = useState<OfflineAreaInfo[]>([])
  const [areaBounds, setAreaBounds] = useState<OfflineAreaBounds[]>([])
  const newNameRef = useRef("")
  const nameInputRef = useRef<TextInput>(null)

  const currentBoundsRef = useRef<[[number, number], [number, number]] | null>(null)
  const [estimatedSizeLabel, setEstimatedSizeLabel] = useState<string | null>(null)

  const [isCentered, setIsCentered] = useState(true)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  const [itemAction, setItemAction] = useState<ItemAction | null>(null)
  const [currentStyleUrl, setCurrentStyleUrl] = useState<string | null>(null)

  // Download state
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<OfflinePackStatus | null>(null)
  const [downloadBounds, setDownloadBounds] = useState<[[number, number], [number, number]] | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Track the active pack name so we can unsubscribe on unmount
  const activePackNameRef = useRef<string | null>(null)

  const mapRef = useRef<ColotaMapRef>(null)
  const initialCenter = useRef<{ latitude: number; longitude: number } | null>(null)

  // Unsubscribe listeners when the screen unmounts mid-download
  useEffect(() => {
    return () => {
      if (activePackNameRef.current) {
        unsubscribeOfflinePack(activePackNameRef.current)
      }
    }
  }, [])

  // Re-check network state when the app comes back to the foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        NativeLocationService.isNetworkAvailable().then((available) => setIsOffline(!available))
      }
    })
    return () => sub.remove()
  }, [])

  const loadAreas = useCallback(async () => {
    try {
      const [data, bounds] = await Promise.all([loadOfflineAreas(), loadOfflineAreaBounds()])
      setAreas(data)
      // Remove bounds entries for packs that no longer exist
      const packNames = new Set(data.map((a) => a.name))
      const validBounds = bounds.filter((b) => packNames.has(b.name))
      if (validBounds.length < bounds.length) {
        const orphaned = bounds.filter((b) => !packNames.has(b.name))
        await Promise.all(orphaned.map((b) => removeOfflineAreaBounds(b.name)))
      }
      setAreaBounds(validBounds)
    } catch (err) {
      logger.error("[OfflineMapsScreen] Failed to load offline areas:", err)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadAreas()
      NativeLocationService.isNetworkAvailable().then((available) => setIsOffline(!available))
      NativeLocationService.getSetting("mapStyleUrlLight").then((url) => {
        setCurrentStyleUrl(url || MAP_STYLE_URL_LIGHT)
      })
    }, [loadAreas])
  )

  // Set initial map center from live coords or last known location
  useEffect(() => {
    if (hasInitialCoords) return

    if (coords) {
      initialCenter.current = { latitude: coords.latitude, longitude: coords.longitude }
      setHasInitialCoords(true)
      return
    }

    NativeLocationService.getMostRecentLocation().then((latest) => {
      if (initialCenter.current) return
      initialCenter.current = latest
        ? { latitude: latest.latitude, longitude: latest.longitude }
        : { latitude: 0, longitude: 0 }
      setHasInitialCoords(true)
    })
  }, [coords, hasInitialCoords])

  const handleCenterMe = useCallback(() => {
    if (coords && mapRef.current?.camera) {
      mapRef.current.camera.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: DEFAULT_MAP_ZOOM,
        duration: MAP_ANIMATION_DURATION_MS
      })
      setIsCentered(true)
    }
  }, [coords])

  const updateBoundsAndEstimate = useCallback((ne: [number, number], sw: [number, number]) => {
    currentBoundsRef.current = [ne, sw]
    setEstimatedSizeLabel(estimateSizeLabel(ne, sw))
  }, [])

  const handleRegionChange = useCallback(
    (payload: { isUserInteraction: boolean; bounds?: [number, number, number, number] }) => {
      if (payload.isUserInteraction) setIsCentered(false)
      if (payload.bounds) {
        const [west, south, east, north] = payload.bounds
        updateBoundsAndEstimate([east, north], [west, south])
      }
    },
    [updateBoundsAndEstimate]
  )

  const handleMapReady = useCallback(async () => {
    try {
      const bounds = await mapRef.current?.mapView?.getBounds()
      if (bounds) {
        const [west, south, east, north] = bounds
        updateBoundsAndEstimate([east, north], [west, south])
      }
    } catch {
      // map not ready yet
    }
  }, [updateBoundsAndEstimate])

  const beginDownload = useCallback(
    (name: string, ne: [number, number], sw: [number, number], onComplete?: () => void) => {
      const MAX_RETRIES = 3
      const RETRY_DELAY_MS = 5000

      setDownloading(true)
      setDownloadBounds([ne, sw])
      setDownloadProgress(null)
      setDownloadError(null)
      activePackNameRef.current = name

      const attempt = (retriesLeft: number) => {
        const onFailure = (message: string) => {
          if (retriesLeft > 0) {
            const attempt_num = MAX_RETRIES - retriesLeft + 1
            logger.warn(`[OfflineMapsScreen] Download failed, retrying (${attempt_num}/${MAX_RETRIES})...`)
            setDownloadError(`Retrying... (${attempt_num}/${MAX_RETRIES})`)
            setDownloadProgress(null)
            setTimeout(async () => {
              try {
                await deleteOfflineArea(name)
              } catch {}
              attempt(retriesLeft - 1)
            }, RETRY_DELAY_MS)
          } else {
            activePackNameRef.current = null
            setDownloading(false)
            setDownloadBounds(null)
            setDownloadError(message)
            removeOfflineAreaBounds(name)
            setAreaBounds((prev) => prev.filter((b) => b.name !== name))
          }
        }

        createOfflinePack(
          name,
          ne,
          sw,
          (status: OfflinePackStatus) => {
            setDownloadProgress(status)
            setDownloadError(null)
            if (status.state === DOWNLOAD_STATE.COMPLETE) {
              activePackNameRef.current = null
              setDownloading(false)
              setDownloadBounds(null)
              onComplete?.()
              loadAreas()
            }
          },
          (err: unknown) => {
            logger.warn("[OfflineMapsScreen] Tile error (may retry):", err)
          }
        ).catch(() => {
          onFailure("Failed to start download. Please try again.")
          deleteOfflineArea(name).catch(() => {})
        })
      }

      attempt(MAX_RETRIES)
    },
    [loadAreas]
  )

  const handleDownload = useCallback(async () => {
    if (!newNameRef.current.trim()) {
      showAlert("Missing Name", "Please enter a name for this area.", "warning")
      return
    }
    if (isOffline) {
      showAlert("Offline", "An internet connection is required to download map tiles.", "warning")
      return
    }

    const name = newNameRef.current.trim()
    const bounds = currentBoundsRef.current
    if (!bounds) {
      showAlert("Map Not Ready", "Wait for the map to load before downloading.", "warning")
      return
    }
    const [ne, sw] = bounds

    if (areas.some((a) => a.name === name)) {
      showAlert("Duplicate Name", `An area named "${name}" already exists. Choose a different name.`, "warning")
      return
    }

    const isUnmetered = await NativeLocationService.isUnmeteredConnection()
    if (!isUnmetered) {
      const wifiConfirmed = await showConfirm({
        title: "Mobile Data",
        message: "You're not on WiFi. Downloading map tiles may use significant mobile data. Continue?",
        confirmText: "Download Anyway",
        destructive: false
      })
      if (!wifiConfirmed) return
    }

    const estimatedBytes = estimateSizeBytes(ne, sw)
    const availableMB = await NativeLocationService.getAvailableStorageMB()
    if (availableMB > 0 && estimatedBytes / (1024 * 1024) > availableMB * 0.9) {
      showAlert("Storage Full", "Not enough storage space for this download.", "warning")
      return
    }

    const sizeLabel = estimateSizeLabel(ne, sw)
    const exceedsLimit = willExceedTileLimit(ne, sw)
    const confirmed = await showConfirm({
      title: `Download "${name}"?`,
      message: `${sizeLabel} estimated${exceedsLimit ? "\n\nThis area is large - outer edges may have incomplete coverage." : ""}`,
      confirmText: "Download",
      destructive: false
    })
    if (!confirmed) return

    const entry: OfflineAreaBounds = {
      name,
      ne,
      sw,
      styleUrl: currentStyleUrl ?? MAP_STYLE_URL_LIGHT,
      downloadedAt: Date.now()
    }
    await saveOfflineAreaBounds(entry)
    setAreaBounds((prev) => [...prev.filter((b) => b.name !== name), entry])
    beginDownload(name, ne, sw, () => {
      nameInputRef.current?.clear()
      newNameRef.current = ""
    })
  }, [isOffline, areas, currentStyleUrl, beginDownload])

  const handleCancelDownload = useCallback(async () => {
    const name = activePackNameRef.current
    activePackNameRef.current = null
    setDownloading(false)
    setDownloadBounds(null)
    setDownloadProgress(null)
    setDownloadError(null)
    if (name) {
      setAreaBounds((prev) => prev.filter((b) => b.name !== name))
      try {
        await deleteOfflineArea(name)
        await removeOfflineAreaBounds(name)
      } catch (err) {
        logger.error("[OfflineMapsScreen] Failed to delete cancelled pack:", err)
      }
    }
  }, [])

  const handleRefresh = useCallback(
    async (area: OfflineAreaInfo) => {
      if (downloading) return
      const bounds = areaBounds.find((b) => b.name === area.name)
      if (!bounds) {
        showAlert("Cannot Refresh", "No bounds saved for this area. Delete and re-download it.", "warning")
        return
      }
      if (isOffline) {
        showAlert("Offline", "An internet connection is required to download map tiles.", "warning")
        return
      }
      const sizeLabel = estimateSizeLabel(bounds.ne, bounds.sw)

      const isUnmetered = await NativeLocationService.isUnmeteredConnection()
      if (!isUnmetered) {
        const wifiConfirmed = await showConfirm({
          title: "Mobile Data",
          message: "You're not on WiFi. Re-downloading may use significant mobile data. Continue?",
          confirmText: "Continue",
          destructive: false
        })
        if (!wifiConfirmed) return
      }

      const confirmed = await showConfirm({
        title: `Re-download "${area.name}"?`,
        message: `Replaces existing tiles with a fresh download. ${sizeLabel} estimated.`,
        confirmText: "Re-download",
        destructive: false
      })
      if (!confirmed) return

      setItemAction({ area: area.name, action: "refreshing" })
      try {
        await deleteOfflineArea(area.name)
      } catch {
        // pack may already be gone
      }
      setItemAction(null)
      setAreas((prev) => prev.filter((a) => a.name !== area.name))

      const styleUrl = currentStyleUrl ?? MAP_STYLE_URL_LIGHT
      const entry: OfflineAreaBounds = {
        name: area.name,
        ne: bounds.ne,
        sw: bounds.sw,
        styleUrl,
        downloadedAt: Date.now()
      }
      await saveOfflineAreaBounds(entry)
      setAreaBounds((prev) => [...prev.filter((b) => b.name !== area.name), entry])

      beginDownload(area.name, bounds.ne, bounds.sw)
    },
    [downloading, isOffline, areaBounds, currentStyleUrl, beginDownload]
  )

  const handleDelete = useCallback(
    async (area: OfflineAreaInfo) => {
      const confirmed = await showConfirm({
        title: "Delete Area",
        message: `Delete "${area.name}"? The downloaded tiles will be removed from your device.`,
        confirmText: "Delete",
        destructive: true
      })
      if (!confirmed) return

      setItemAction({ area: area.name, action: "deleting" })
      try {
        await deleteOfflineArea(area.name)
        await removeOfflineAreaBounds(area.name)
        await loadAreas()
      } catch {
        showAlert("Error", "Failed to delete area.", "error")
      } finally {
        setItemAction(null)
      }
    },
    [loadAreas]
  )

  const handleCancelArea = useCallback(
    async (area: OfflineAreaInfo) => {
      setItemAction({ area: area.name, action: "canceling" })
      try {
        await deleteOfflineArea(area.name)
        await removeOfflineAreaBounds(area.name)
        await loadAreas()
      } catch {
        showAlert("Error", "Failed to cancel download.", "error")
      } finally {
        setItemAction(null)
      }
    },
    [loadAreas]
  )

  const fitToArea = useCallback(
    (name: string) => {
      const entry = areaBounds.find((b) => b.name === name)
      if (!entry || !mapRef.current?.camera) return
      mapRef.current.camera.fitBounds([entry.sw[0], entry.sw[1], entry.ne[0], entry.ne[1]], {
        padding: { top: 40, right: 40, bottom: 40, left: 40 },
        duration: MAP_ANIMATION_DURATION_MS
      })
    },
    [areaBounds]
  )

  const handleAreaPress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      if (downloading) return
      const name: string | undefined = event.nativeEvent.features?.[0]?.properties?.name
      if (name) fitToArea(name)
    },
    [downloading, fitToArea]
  )

  const handleNameChange = useCallback((v: string) => {
    newNameRef.current = v
  }, [])

  const savedAreasGeoJSON = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: areaBounds.map((b) => {
        const [neLon, neLat] = b.ne
        const [swLon, swLat] = b.sw
        return {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [swLon, neLat],
                [neLon, neLat],
                [neLon, swLat],
                [swLon, swLat],
                [swLon, neLat]
              ]
            ]
          },
          properties: { name: b.name }
        }
      })
    }),
    [areaBounds]
  )

  const downloadAreaGeoJSON = useMemo((): GeoJSON.Feature | null => {
    if (!downloadBounds) return null
    const [ne, sw] = downloadBounds
    const [neLon, neLat] = ne
    const [swLon, swLat] = sw
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [swLon, neLat],
            [neLon, neLat],
            [neLon, swLat],
            [swLon, swLat],
            [swLon, neLat]
          ]
        ]
      },
      properties: {}
    }
  }, [downloadBounds])

  const hasRealCoords =
    initialCenter.current && (initialCenter.current.latitude !== 0 || initialCenter.current.longitude !== 0)
  const initialZoom = hasRealCoords ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM

  const totalStorageBytes = useMemo(() => areas.reduce((sum, a) => sum + (a.sizeBytes ?? 0), 0), [areas])

  // For the map overlay hint only - DownloadForm computes its own copy
  const progressPct = downloadProgress?.percentage ?? 0
  const progressLabel =
    downloadProgress?.state === DOWNLOAD_STATE.COMPLETE
      ? "Complete"
      : downloadProgress
        ? `${Math.round(progressPct)}%`
        : "Starting..."

  const renderItem = useCallback(
    ({ item }: { item: OfflineAreaInfo }) => {
      const isDeleting = itemAction?.area === item.name && itemAction?.action === "deleting"
      const isCanceling = itemAction?.area === item.name && itemAction?.action === "canceling"
      const isRefreshing = itemAction?.area === item.name && itemAction?.action === "refreshing"
      const bounds = areaBounds.find((b) => b.name === item.name)
      const isStale = item.isComplete && !!bounds?.styleUrl && !!currentStyleUrl && bounds.styleUrl !== currentStyleUrl
      return (
        <Card style={styles.card}>
          <View style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.info, pressed && { opacity: colors.pressedOpacity }]}
              onPress={() => fitToArea(item.name)}
              disabled={item.isActive}
            >
              <View style={styles.nameRow}>
                {item.isComplete && <CheckCircle size={14} color={colors.success} />}
                {item.isActive && <ActivityIndicator size="small" color={colors.primary} />}
                <Text style={[styles.areaName, { color: colors.text }]}>{item.name}</Text>
                {isStale && (
                  <View testID={`stale-indicator-${item.name}`}>
                    <AlertTriangle size={13} color={colors.warning} />
                  </View>
                )}
              </View>
              <Text style={[styles.areaSub, { color: colors.textSecondary }]}>
                {item.isActive ? "Downloading..." : item.sizeBytes !== null ? formatBytes(item.sizeBytes) : ""}
              </Text>
              {!item.isActive && bounds?.downloadedAt && (
                <Text style={[styles.areaSubDate, { color: colors.textSecondary }]}>
                  {formatRelativeTime(bounds.downloadedAt)}
                </Text>
              )}
            </Pressable>

            {item.isActive ? (
              <Pressable
                onPress={() => handleCancelArea(item)}
                disabled={isCanceling}
                style={({ pressed }) => [
                  styles.cancelAreaBtn,
                  { backgroundColor: colors.error + "15", borderColor: colors.error + "40" },
                  pressed && { opacity: colors.pressedOpacity }
                ]}
              >
                {isCanceling ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={[styles.cancelAreaLabel, { color: colors.error }]}>Cancel</Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.actionBtns}>
                {item.isComplete && (
                  <Pressable
                    testID={`refresh-btn-${item.name}`}
                    onPress={() => handleRefresh(item)}
                    disabled={downloading || isRefreshing}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { backgroundColor: colors.primary + "15" },
                      pressed && { opacity: colors.pressedOpacity }
                    ]}
                  >
                    {isRefreshing ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <RefreshCw size={14} color={colors.primary} />
                    )}
                  </Pressable>
                )}
                <Pressable
                  testID={`delete-btn-${item.name}`}
                  onPress={() => handleDelete(item)}
                  disabled={isDeleting}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    { backgroundColor: colors.error + "15" },
                    pressed && { opacity: colors.pressedOpacity }
                  ]}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <X size={16} color={colors.error} />
                  )}
                </Pressable>
              </View>
            )}
          </View>
        </Card>
      )
    },
    [
      colors,
      itemAction,
      areaBounds,
      currentStyleUrl,
      downloading,
      fitToArea,
      handleDelete,
      handleCancelArea,
      handleRefresh
    ]
  )

  const listHeader = useMemo(
    () => (
      <DownloadForm
        colors={colors}
        estimatedSizeLabel={estimatedSizeLabel}
        downloading={downloading}
        downloadProgress={downloadProgress}
        downloadError={downloadError}
        areasCount={areas.length}
        totalStorageBytes={totalStorageBytes}
        nameInputRef={nameInputRef}
        onNameChange={handleNameChange}
        onDownload={handleDownload}
        onCancelDownload={handleCancelDownload}
      />
    ),
    [
      colors,
      estimatedSizeLabel,
      downloading,
      downloadProgress,
      downloadError,
      areas.length,
      totalStorageBytes,
      handleDownload,
      handleCancelDownload,
      handleNameChange
    ]
  )

  const mapDownloadingStyle = downloading ? { borderColor: colors.primary, borderWidth: 2 as const } : null
  const savedAreasFillStyle = { fillColor: colors.success, fillOpacity: 0.1 }
  const savedAreasBorderStyle = { lineColor: colors.success, lineWidth: 1.5, lineOpacity: 0.6 }
  const downloadAreaFillStyle = { fillColor: colors.info, fillOpacity: 0.2 }
  const downloadAreaBorderStyle = { lineColor: colors.info, lineWidth: 1.5, lineOpacity: 0.6 }

  return (
    <Container>
      <View style={[styles.map, mapDownloadingStyle]}>
        {hasInitialCoords && initialCenter.current ? (
          <ColotaMapView
            ref={mapRef}
            initialCenter={[initialCenter.current.longitude, initialCenter.current.latitude]}
            initialZoom={initialZoom}
            onRegionDidChange={handleRegionChange}
            onMapReady={handleMapReady}
          >
            {savedAreasGeoJSON.features.length > 0 && (
              <GeoJSONSource id="saved-areas" data={savedAreasGeoJSON} onPress={handleAreaPress}>
                <Layer id="saved-areas-fill" type="fill" style={savedAreasFillStyle} />
                <Layer id="saved-areas-border" type="line" style={savedAreasBorderStyle} />
              </GeoJSONSource>
            )}
            {downloadAreaGeoJSON && (
              <GeoJSONSource id="offline-area" data={downloadAreaGeoJSON}>
                <Layer id="offline-area-fill" type="fill" style={downloadAreaFillStyle} />
                <Layer id="offline-area-border" type="line" style={downloadAreaBorderStyle} />
              </GeoJSONSource>
            )}
          </ColotaMapView>
        ) : null}

        <MapCenterButton visible={!isCentered && !!coords} onPress={handleCenterMe} />

        {downloading && (
          <View style={[styles.mapHint, { backgroundColor: colors.card }]}>
            <Text style={[styles.mapHintText, { color: colors.text }]}>Downloading... {progressLabel}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={areas}
        keyExtractor={(item) => item.name}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          areas.length === 0 && !downloading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No saved areas yet</Text>
              <Text style={[styles.emptyHint, { color: colors.textLight }]}>
                Download map tiles to browse your tracks offline while hiking or camping
              </Text>
            </View>
          ) : null
        }
        renderItem={renderItem}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  map: { height: 450, overflow: "hidden" },
  list: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 16 },
  hint: { fontSize: 13, ...fonts.regular, lineHeight: 18, marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 12,
    ...fonts.semiBold,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  input: { padding: 14, borderWidth: 1.5, borderRadius: 10, fontSize: 15 },
  sizeEstimate: { fontSize: 12, ...fonts.regular, marginBottom: 12 },
  downloadBtn: { padding: 16, borderRadius: 12, alignItems: "center" },
  downloadBtnText: { fontSize: 16, ...fonts.semiBold },
  progressContainer: { gap: 10 },
  progressHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressLabel: { fontSize: 14, ...fonts.semiBold },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressSub: { fontSize: 12, ...fonts.regular },
  cancelBtn: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    marginTop: 4
  },
  cancelBtnText: { fontSize: 14, ...fonts.semiBold },
  errorText: { fontSize: 13, ...fonts.regular, marginTop: 10 },
  card: { marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { flex: 1, marginRight: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  areaName: { fontSize: 15, ...fonts.semiBold },
  areaSub: { fontSize: 12 },
  areaSubDate: { fontSize: 11, ...fonts.regular, marginTop: 2, opacity: 0.7 },
  savedAreasMeta: { fontSize: 12, ...fonts.regular, marginTop: 2, marginBottom: 12, paddingHorizontal: 4 },
  actionBtns: { flexDirection: "row", gap: 6, alignItems: "center" },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  cancelAreaBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1
  },
  cancelAreaLabel: { fontSize: 13, ...fonts.semiBold },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 15, ...fonts.semiBold, marginBottom: 6 },
  emptyHint: { fontSize: 13, textAlign: "center", maxWidth: 260, lineHeight: 18 },
  mapHint: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    padding: 12,
    borderRadius: 12,
    elevation: 8,
    shadowOpacity: 0.2,
    zIndex: 5,
    alignItems: "center"
  },
  mapHintText: { fontSize: 13, ...fonts.semiBold }
})
