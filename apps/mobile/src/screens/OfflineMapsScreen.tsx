/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator, AppState } from "react-native"
import { ShapeSource, FillLayer, LineLayer, type OnPressEvent } from "@maplibre/maplibre-react-native"
import { useTheme } from "../hooks/useTheme"
import { showAlert, showConfirm } from "../services/modalService"
import { ScreenProps } from "../types/global"
import { useCoords } from "../contexts/TrackingProvider"
import { fonts } from "../styles/typography"
import { X, WifiOff, CheckCircle } from "lucide-react-native"
import { Container, SectionTitle, Card } from "../components"
import { useFocusEffect } from "@react-navigation/native"
import { DEFAULT_MAP_ZOOM, WORLD_MAP_ZOOM, MAP_ANIMATION_DURATION_MS } from "../constants"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { logger } from "../utils/logger"
import { longDistanceUnit, longInputToMeters, radiusToBounds } from "../utils/geo"
import NativeLocationService from "../services/NativeLocationService"
import {
  createOfflinePack,
  loadOfflineAreas,
  deleteOfflineArea,
  unsubscribeOfflinePack,
  formatBytes,
  DETAIL_LABELS,
  DETAIL_SUBLABELS,
  DOWNLOAD_STATE,
  OfflineDetailLevel,
  OfflinePackStatus,
  OfflineAreaInfo,
  OfflineAreaBounds,
  estimateSizeLabel,
  estimateSizeBytes,
  willExceedTileLimit,
  MAX_OFFLINE_RADIUS_M,
  loadOfflineAreaBounds,
  saveOfflineAreaBounds,
  removeOfflineAreaBounds
} from "../components/features/map/OfflinePackManager"

export function OfflineMapsScreen({}: ScreenProps) {
  const coords = useCoords()
  const { colors } = useTheme()

  const [areas, setAreas] = useState<OfflineAreaInfo[]>([])
  const [areaBounds, setAreaBounds] = useState<OfflineAreaBounds[]>([])
  const [newName, setNewName] = useState("")
  const [newRadius, setNewRadius] = useState("5")
  const [detail, setDetail] = useState<OfflineDetailLevel>("road")
  const [placingArea, setPlacingArea] = useState(false)

  const [isCentered, setIsCentered] = useState(true)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)
  const [isOffline, setIsOffline] = useState(false)

  const [deletingArea, setDeletingArea] = useState<string | null>(null)
  const [cancelingArea, setCancelingArea] = useState<string | null>(null)

  // Download state
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<OfflinePackStatus | null>(null)
  const [downloadCenter, setDownloadCenter] = useState<{ lat: number; lon: number } | null>(null)
  const [downloadRadius, setDownloadRadius] = useState(0)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Track the active pack name so we can unsubscribe on unmount (fix: listener leak)
  const activePackNameRef = useRef<string | null>(null)

  const mapRef = useRef<ColotaMapRef>(null)
  const initialCenter = useRef<{ latitude: number; longitude: number } | null>(null)

  // Unsubscribe listeners when the screen unmounts mid-download (fix: listener leak)
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
      // Remove bounds entries for packs that no longer exist (cleared storage, etc.)
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

  // Reload areas and network state every time the screen comes into focus
  // (fix: remount state - picks up any isActive packs after navigation away)
  useFocusEffect(
    useCallback(() => {
      loadAreas()
      NativeLocationService.isNetworkAvailable().then((available) => setIsOffline(!available))
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
      mapRef.current.camera.setCamera({
        centerCoordinate: [coords.longitude, coords.latitude],
        zoomLevel: DEFAULT_MAP_ZOOM,
        animationDuration: MAP_ANIMATION_DURATION_MS,
        animationMode: "flyTo"
      })
      setIsCentered(true)
    }
  }, [coords])

  const handleRegionChange = useCallback((payload: { isUserInteraction: boolean }) => {
    if (payload.isUserInteraction) {
      setIsCentered(false)
    }
  }, [])

  const startPlacingArea = useCallback(() => {
    if (!newName.trim()) {
      showAlert("Missing Name", "Please enter a name for this area.", "warning")
      return
    }
    const radius = Number(newRadius)
    if (!radius || radius <= 0) {
      showAlert("Invalid Radius", "Please enter a valid radius.", "warning")
      return
    }
    const radiusMeters = longInputToMeters(radius)
    if (radiusMeters > MAX_OFFLINE_RADIUS_M) {
      const maxDisplay = longDistanceUnit() === "mi" ? "62 mi" : "100 km"
      showAlert("Radius Too Large", `Maximum radius is ${maxDisplay}. Try a smaller area.`, "warning")
      return
    }
    if (isOffline) {
      showAlert("Offline", "An internet connection is required to download map tiles.", "warning")
      return
    }

    setPlacingArea(true)
    setDownloadError(null)
  }, [newName, newRadius, isOffline])

  const handleMapPress = useCallback(
    async (pressCoords: { latitude: number; longitude: number }) => {
      if (!placingArea || downloading) return

      const radiusMeters = longInputToMeters(Number(newRadius))
      const name = newName.trim()

      // Proactive duplicate name check against current areas state
      if (areas.some((a) => a.name === name)) {
        setDownloadError(`An area named "${name}" already exists. Choose a different name.`)
        return
      }

      setPlacingArea(false)

      // Re-check connection at download time - WiFi may have changed since button press
      const isUnmetered = await NativeLocationService.isUnmeteredConnection()
      if (!isUnmetered) {
        const wifiConfirmed = await showConfirm({
          title: "Mobile Data",
          message: "You're not on WiFi. Downloading map tiles may use significant mobile data. Continue?",
          confirmText: "Download Anyway",
          destructive: false
        })
        if (!wifiConfirmed) {
          setPlacingArea(true)
          return
        }
      }

      const estimatedBytes = estimateSizeBytes(pressCoords.latitude, radiusMeters, detail)
      const availableMB = await NativeLocationService.getAvailableStorageMB()
      if (availableMB > 0 && estimatedBytes / (1024 * 1024) > availableMB * 0.9) {
        setDownloadError("Not enough storage space for this download.")
        setPlacingArea(true)
        return
      }

      const sizeLabel = estimateSizeLabel(pressCoords.latitude, radiusMeters, detail)
      const exceedsLimit = willExceedTileLimit(pressCoords.latitude, radiusMeters, detail)
      const confirmed = await showConfirm({
        title: `Download "${name}"?`,
        message: `${DETAIL_LABELS[detail]} detail - ${sizeLabel} estimated${exceedsLimit ? "\n\nThis area is large - outer edges may have incomplete coverage." : ""}`,
        confirmText: "Download",
        destructive: false
      })
      if (!confirmed) {
        setPlacingArea(true)
        return
      }

      const newEntry = { name, lat: pressCoords.latitude, lon: pressCoords.longitude, radiusMeters }
      await saveOfflineAreaBounds(newEntry)
      setAreaBounds((prev) => [...prev.filter((b) => b.name !== name), newEntry])

      setDownloading(true)
      setDownloadCenter({ lat: pressCoords.latitude, lon: pressCoords.longitude })
      setDownloadRadius(radiusMeters)
      setDownloadProgress(null)
      setDownloadError(null)
      activePackNameRef.current = name

      try {
        await createOfflinePack(
          name,
          pressCoords.latitude,
          pressCoords.longitude,
          radiusMeters,
          detail,
          (status: OfflinePackStatus) => {
            setDownloadProgress(status)
            if (status.state === DOWNLOAD_STATE.COMPLETE) {
              activePackNameRef.current = null
              setDownloading(false)
              setDownloadCenter(null)
              setNewName("")
              setNewRadius("5")
              loadAreas()
            } else if (status.state === DOWNLOAD_STATE.FAILED) {
              logger.error("[OfflineMapsScreen] Download failed via progress callback")
              activePackNameRef.current = null
              setDownloading(false)
              setDownloadCenter(null)
              setDownloadError("Download failed. Please try again.")
              removeOfflineAreaBounds(name)
              setAreaBounds((prev) => prev.filter((b) => b.name !== name))
            }
          },
          (err: unknown) => {
            logger.error("[OfflineMapsScreen] Download error:", err)
            activePackNameRef.current = null
            setDownloading(false)
            setDownloadCenter(null)
            setDownloadError("Download failed. Please try again.")
            removeOfflineAreaBounds(name)
            setAreaBounds((prev) => prev.filter((b) => b.name !== name))
          }
        )
      } catch {
        activePackNameRef.current = null
        setDownloading(false)
        setDownloadCenter(null)
        setDownloadError("Failed to start download. Please try again.")
        removeOfflineAreaBounds(name)
        setAreaBounds((prev) => prev.filter((b) => b.name !== name))
        try {
          await deleteOfflineArea(name)
        } catch {
          // pack was never persisted - nothing to clean up
        }
      }
    },
    [placingArea, downloading, newName, newRadius, detail, loadAreas, areas]
  )

  // Cancel the in-progress download (fix: cancel button)
  const handleCancelDownload = useCallback(async () => {
    const name = activePackNameRef.current
    activePackNameRef.current = null
    setDownloading(false)
    setDownloadCenter(null)
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

  const handleDelete = useCallback(
    async (area: OfflineAreaInfo) => {
      const confirmed = await showConfirm({
        title: "Delete Area",
        message: `Delete "${area.name}"? The downloaded tiles will be removed from your device.`,
        confirmText: "Delete",
        destructive: true
      })
      if (!confirmed) return

      setDeletingArea(area.name)
      try {
        await deleteOfflineArea(area.name)
        await removeOfflineAreaBounds(area.name)
        await loadAreas()
      } catch {
        showAlert("Error", "Failed to delete area.", "error")
      } finally {
        setDeletingArea(null)
      }
    },
    [loadAreas]
  )

  // Cancel a pack that is still downloading (visible after navigating back to screen)
  const handleCancelArea = useCallback(
    async (area: OfflineAreaInfo) => {
      setCancelingArea(area.name)
      try {
        await deleteOfflineArea(area.name)
        await removeOfflineAreaBounds(area.name)
        await loadAreas()
      } catch {
        showAlert("Error", "Failed to cancel download.", "error")
      } finally {
        setCancelingArea(null)
      }
    },
    [loadAreas]
  )

  // Live size estimate - updates as the user changes radius / detail.
  // Use actual user latitude for accuracy (tile columns widen toward the poles).
  const estimatedSizeLabel = useMemo(() => {
    const radius = Number(newRadius)
    if (!radius || radius <= 0 || !coords) return null
    const radiusMeters = longInputToMeters(radius)
    return estimateSizeLabel(coords.latitude, radiusMeters, detail)
  }, [newRadius, detail, coords])

  const fitToArea = useCallback(
    (name: string) => {
      const entry = areaBounds.find((b) => b.name === name)
      if (!entry || !mapRef.current?.camera) return
      const [[east, north], [west, south]] = radiusToBounds(entry.lat, entry.lon, entry.radiusMeters)
      mapRef.current.camera.fitBounds([east, north], [west, south], 40, MAP_ANIMATION_DURATION_MS)
    },
    [areaBounds]
  )

  const handleAreaPress = useCallback(
    (event: OnPressEvent) => {
      if (placingArea || downloading) return
      const name: string | undefined = event.features?.[0]?.properties?.name
      if (name) fitToArea(name)
    },
    [placingArea, downloading, fitToArea]
  )

  // GeoJSON FeatureCollection of all saved area bounding boxes
  const savedAreasGeoJSON = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: areaBounds.map((b) => {
        const [[east, north], [west, south]] = radiusToBounds(b.lat, b.lon, b.radiusMeters)
        return {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [west, north],
                [east, north],
                [east, south],
                [west, south],
                [west, north]
              ]
            ]
          },
          properties: { name: b.name }
        }
      })
    }),
    [areaBounds]
  )

  // GeoJSON for the area being downloaded
  const downloadAreaGeoJSON = useMemo((): GeoJSON.Feature | null => {
    if (!downloadCenter) return null
    const [[east, north], [west, south]] = radiusToBounds(downloadCenter.lat, downloadCenter.lon, downloadRadius)
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, north],
            [east, north],
            [east, south],
            [west, south],
            [west, north]
          ]
        ]
      },
      properties: {}
    }
  }, [downloadCenter, downloadRadius])

  const hasRealCoords =
    initialCenter.current && (initialCenter.current.latitude !== 0 || initialCenter.current.longitude !== 0)
  const initialZoom = hasRealCoords ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM

  const renderItem = useCallback(
    ({ item }: { item: OfflineAreaInfo }) => {
      const isDeleting = deletingArea === item.name
      const isCanceling = cancelingArea === item.name
      return (
        <Card style={styles.card}>
          <View style={styles.row}>
            <Pressable
              style={({ pressed }) => [styles.info, pressed && { opacity: 0.6 }]}
              onPress={() => fitToArea(item.name)}
              disabled={item.isActive}
            >
              <View style={styles.nameRow}>
                {item.isComplete && <CheckCircle size={14} color={colors.success} />}
                {item.isActive && <ActivityIndicator size="small" color={colors.primary} />}
                <Text style={[styles.areaName, { color: colors.text }]}>{item.name}</Text>
              </View>
              <Text style={[styles.areaSub, { color: colors.textSecondary }]}>
                {item.isActive ? "Downloading..." : item.sizeBytes !== null ? formatBytes(item.sizeBytes) : null}
              </Text>
            </Pressable>

            {item.isActive ? (
              <Pressable
                onPress={() => handleCancelArea(item)}
                disabled={isCanceling}
                style={({ pressed }) => [
                  styles.cancelAreaBtn,
                  { backgroundColor: colors.error + "15", borderColor: colors.error + "40" },
                  pressed && { opacity: 0.7 }
                ]}
              >
                {isCanceling ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={[styles.cancelAreaLabel, { color: colors.error }]}>Cancel</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={() => handleDelete(item)}
                disabled={isDeleting}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  { backgroundColor: colors.error + "15" },
                  pressed && { opacity: 0.7 }
                ]}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <X size={16} color={colors.error} />
                )}
              </Pressable>
            )}
          </View>
        </Card>
      )
    },
    [colors, handleDelete, handleCancelArea, fitToArea, deletingArea, cancelingArea]
  )

  const progressPct = downloadProgress?.percentage ?? 0
  const progressLabel =
    downloadProgress?.state === DOWNLOAD_STATE.COMPLETE
      ? "Complete"
      : downloadProgress
        ? `${Math.round(progressPct)}%`
        : "Starting..."

  const progressSizeLabel = (() => {
    if (!downloadProgress || downloadProgress.completedResourceSize <= 0) return null
    const {
      completedResourceSize: done,
      completedResourceCount: count,
      requiredResourceCount: total
    } = downloadProgress
    const downloaded = formatBytes(done)
    // Only show projected total once >5% is done to avoid wild early fluctuations
    if (progressPct >= 5 && count > 0 && total > 0) {
      return `${downloaded} / ~${formatBytes((done / count) * total)}`
    }
    return downloaded
  })()

  const distanceUnit = longDistanceUnit()

  // Memoized to prevent FlatList from remounting the header on unrelated state changes
  // (e.g. isCentered, areaBounds). Progress ticks still update it since downloadProgress is a dep.
  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.section}>
          <SectionTitle>Download Area</SectionTitle>
          <Card>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Enter a name and radius, then tap the map to set the center. Tiles download for a square area around that
              point.
            </Text>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, styles.inputGroupName]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
                  ]}
                  placeholder="Home area, Trail..."
                  placeholderTextColor={colors.placeholder}
                  value={newName}
                  onChangeText={setNewName}
                  editable={!downloading}
                />
              </View>

              <View style={[styles.inputGroup, styles.inputGroupRadius]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Radius ({distanceUnit})</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.inputCentered,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }
                  ]}
                  placeholder="5"
                  placeholderTextColor={colors.placeholder}
                  value={newRadius}
                  keyboardType="numeric"
                  onChangeText={setNewRadius}
                  editable={!downloading}
                />
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailLabelRow}>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 0 }]}>Detail Level</Text>
                {estimatedSizeLabel && (
                  <Text style={[styles.sizeEstimate, { color: colors.textSecondary }]}>
                    {estimatedSizeLabel} estimated
                  </Text>
                )}
              </View>
              <View style={styles.chipGroup}>
                {(["road", "trail"] as OfflineDetailLevel[]).map((level) => {
                  const selected = detail === level
                  return (
                    <Pressable
                      key={level}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? colors.primary + "15" : colors.background,
                          borderColor: selected ? colors.primary : colors.border
                        }
                      ]}
                      onPress={() => !downloading && setDetail(level)}
                    >
                      <Text style={[styles.chipLabel, { color: selected ? colors.primary : colors.text }]}>
                        {DETAIL_LABELS[level]}
                      </Text>
                      <Text style={[styles.chipSub, { color: selected ? colors.primary : colors.textSecondary }]}>
                        {DETAIL_SUBLABELS[level]}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

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
                    {progressSizeLabel ? ` - ${progressSizeLabel}` : ""}
                  </Text>
                )}
                <Pressable
                  onPress={handleCancelDownload}
                  style={({ pressed }) => [
                    styles.cancelBtn,
                    { borderColor: colors.error + "60" },
                    pressed && { opacity: 0.7 }
                  ]}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.error }]}>Cancel Download</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.placeBtn,
                  { backgroundColor: colors.primary },
                  pressed && { opacity: 0.7 }
                ]}
                onPress={startPlacingArea}
                disabled={placingArea}
              >
                <Text style={[styles.placeBtnText, { color: colors.textOnPrimary }]}>
                  {placingArea ? "Tap Map to Set Area..." : "Select Area on Map"}
                </Text>
              </Pressable>
            )}

            {downloadError && <Text style={[styles.errorText, { color: colors.error }]}>{downloadError}</Text>}
          </Card>
        </View>

        {areas.length > 0 && <SectionTitle>Saved Areas ({areas.length})</SectionTitle>}
      </>
    ),
    [
      colors,
      newName,
      newRadius,
      detail,
      estimatedSizeLabel,
      downloading,
      placingArea,
      downloadProgress,
      progressLabel,
      progressSizeLabel,
      progressPct,
      downloadError,
      areas.length,
      startPlacingArea,
      handleCancelDownload,
      distanceUnit
    ]
  )

  return (
    <Container>
      <View style={styles.map}>
        {hasInitialCoords && initialCenter.current ? (
          <ColotaMapView
            ref={mapRef}
            initialCenter={[initialCenter.current.longitude, initialCenter.current.latitude]}
            initialZoom={initialZoom}
            onPress={handleMapPress}
            onRegionDidChange={handleRegionChange}
          >
            {savedAreasGeoJSON.features.length > 0 && (
              <ShapeSource id="saved-areas" shape={savedAreasGeoJSON} onPress={handleAreaPress}>
                <FillLayer id="saved-areas-fill" style={{ fillColor: colors.success, fillOpacity: 0.1 }} />
                <LineLayer
                  id="saved-areas-border"
                  style={{ lineColor: colors.success, lineWidth: 1.5, lineOpacity: 0.6 }}
                />
              </ShapeSource>
            )}
            {downloadAreaGeoJSON && (
              <ShapeSource id="offline-area" shape={downloadAreaGeoJSON}>
                <FillLayer id="offline-area-fill" style={{ fillColor: colors.info, fillOpacity: 0.2 }} />
                <LineLayer
                  id="offline-area-border"
                  style={{ lineColor: colors.info, lineWidth: 1.5, lineOpacity: 0.6 }}
                />
              </ShapeSource>
            )}
          </ColotaMapView>
        ) : null}

        <MapCenterButton visible={!isCentered && !!coords} onPress={handleCenterMe} />

        {(placingArea || downloading) && (
          <View style={[styles.mapHint, { backgroundColor: colors.card }]}>
            <Text style={[styles.mapHintText, { color: colors.text }]}>
              {placingArea ? "Tap map to set download area" : `Downloading... ${progressLabel}`}
            </Text>
          </View>
        )}

        {isOffline && (
          <View style={[styles.offlineBanner, { backgroundColor: colors.card }]}>
            <WifiOff size={14} color={colors.textSecondary} />
            <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
              Map tiles unavailable - no internet
            </Text>
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
  inputRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  inputGroup: { flex: 1 },
  inputGroupName: { flex: 2 },
  inputGroupRadius: { flex: 0, minWidth: 90 },
  label: {
    fontSize: 12,
    ...fonts.semiBold,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  input: { padding: 14, borderWidth: 1.5, borderRadius: 10, fontSize: 15 },
  inputCentered: { textAlign: "center" },
  detailRow: { marginBottom: 16 },
  detailLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  sizeEstimate: { fontSize: 12, ...fonts.regular },
  chipGroup: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  chipLabel: { fontSize: 13, ...fonts.semiBold },
  chipSub: { fontSize: 11, ...fonts.regular, marginTop: 2 },
  placeBtn: { padding: 16, borderRadius: 12, alignItems: "center" },
  placeBtnText: { fontSize: 15, ...fonts.semiBold },
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
  card: { marginBottom: 12, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  info: { flex: 1, marginRight: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  areaName: { fontSize: 15, ...fonts.semiBold },
  areaSub: { fontSize: 12 },
  deleteBtn: {
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
  mapHintText: { fontSize: 13, ...fonts.semiBold },
  offlineBanner: {
    position: "absolute",
    bottom: 40,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    elevation: 8,
    shadowOpacity: 0.2,
    zIndex: 5
  },
  offlineText: { fontSize: 13, ...fonts.medium }
})
