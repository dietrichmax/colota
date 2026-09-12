/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native"
import type { NativeSyntheticEvent } from "react-native"
import { GeoJSONSource, Layer, type PressEventWithFeatures } from "@maplibre/maplibre-react-native"
import { useFocusEffect } from "@react-navigation/native"
import { RefreshCw, Trash2, X } from "lucide-react-native"
import { radius } from "@colota/shared"
import {
  Button,
  Card,
  Container,
  Divider,
  EmptyState,
  FieldMessage,
  IconButton,
  ListItem,
  SectionTitle,
  TextField
} from "../components"
import { ColotaMapView, type ColotaMapRef, type RegionChangePayload } from "../components/features/map/ColotaMapView"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import {
  createOfflinePack,
  deleteOfflineArea,
  DOWNLOAD_STATE,
  estimateSizeBytes,
  estimateSizeLabel,
  loadOfflineAreaBounds,
  loadOfflineAreas,
  pruneOfflineAreaBounds,
  removeOfflineAreaBounds,
  saveOfflineAreaBounds,
  subscribeOfflinePack,
  unsubscribeOfflinePack,
  willExceedTileLimit,
  type OfflineAreaBounds,
  type OfflineAreaInfo,
  type OfflinePackStatus
} from "../components/features/map/OfflinePackManager"
import { useCoords } from "../contexts/TrackingProvider"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import {
  areaFeature,
  areasCollection,
  cornersOf,
  deleteAreaConfirm,
  describeArea,
  downloadConfirm,
  downloadLine,
  duplicateNameError,
  INTRO_LINE,
  progressCaption,
  redownloadConfirm,
  ROW_HINT,
  storageMessage,
  type Bounds,
  type Estimate,
  type RowTone
} from "../utils/offlineArea"
import { fonts, fontSizes, lineHeights } from "../styles/typography"
import {
  DEFAULT_MAP_ZOOM,
  GEOFENCE_ZOOM_PADDING,
  MAP_ANIMATION_DURATION_MS,
  MAP_STYLE_URL_LIGHT,
  space,
  WORLD_MAP_ZOOM
} from "../constants"
import type { ScreenProps } from "../types/global"

const MAP_VIEWPORT_SHARE = 0.5
const WORLD_CENTER: [number, number] = [0, 20]
const STORAGE_HEADROOM = 0.9
const BYTES_PER_MB = 1024 * 1024
const [FIT_TOP, FIT_RIGHT, FIT_BOTTOM, FIT_LEFT] = GEOFENCE_ZOOM_PADDING
const FIT_PADDING = { top: FIT_TOP, right: FIT_RIGHT, bottom: FIT_BOTTOM, left: FIT_LEFT }

type Fix = { latitude: number; longitude: number; accuracy: number }
type Download = { name: string; bounds: Bounds | null }
type Busy = { kind: "start" | "stop" | "delete" | "redownload"; name: string }

const NO_CONNECTION = {
  title: "No connection",
  message: "Downloading map tiles needs a network. Saved areas still work."
} as const

function estimateFor(bounds: Bounds): Estimate {
  const { ne, sw } = cornersOf(bounds)
  return { label: estimateSizeLabel(ne, sw), bytes: estimateSizeBytes(ne, sw), large: willExceedTileLimit(ne, sw) }
}

export function OfflineMapsScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const { height: viewportHeight } = useWindowDimensions()
  const mapHeight = Math.round(viewportHeight * MAP_VIEWPORT_SHARE)
  const coords = useCoords()

  const [areas, setAreas] = useState<OfflineAreaInfo[] | null>(null)
  const [areaBounds, setAreaBounds] = useState<OfflineAreaBounds[]>([])
  const [name, setName] = useState("")
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  // `undefined` until the database has answered, so the tiles never open on the world view and jump.
  const [lastFix, setLastFix] = useState<Fix | null | undefined>(undefined)
  const [isCentered, setIsCentered] = useState(true)
  const [currentStyleUrl, setCurrentStyleUrl] = useState<string | null>(null)
  const [download, setDownload] = useState<Download | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<OfflinePackStatus | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)

  // A ref, not the state, because two presses inside one render both read the same state value.
  const busyRef = useRef(false)
  const activePackNameRef = useRef<string | null>(null)
  // True between createOfflinePack being called and its promise settling: a cancel in that window
  // has nothing to delete yet, so the post-create continuation deletes it once, when native answers.
  const createPendingRef = useRef(false)
  const currentBoundsRef = useRef<Bounds | null>(null)
  const tileErrorCountRef = useRef(0)
  const lastTileErrorRef = useRef<unknown>(null)
  const mapRef = useRef<ColotaMapRef>(null)

  const listAreas = useMemo(() => (areas ?? []).filter((a) => a.name !== download?.name), [areas, download])
  const takenNames = useMemo(() => listAreas.map((a) => a.name), [listAreas])
  const nameError = duplicateNameError(name, takenNames)

  useEffect(() => {
    if (coords) {
      setLastFix({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? 0 })
      return
    }
    let active = true
    NativeLocationService.getMostRecentLocation()
      .then((latest) => {
        if (!active) return
        setLastFix(
          latest ? { latitude: latest.latitude, longitude: latest.longitude, accuracy: latest.accuracy ?? 0 } : null
        )
      })
      .catch((err) => {
        logger.error("[OfflineMapsScreen] Failed to read the last known location:", err)
        if (active) setLastFix(null)
      })
    return () => {
      active = false
    }
  }, [coords])

  useEffect(() => {
    return () => {
      if (activePackNameRef.current) unsubscribeOfflinePack(activePackNameRef.current)
    }
  }, [])

  const reportTileErrors = useCallback((packName: string) => {
    if (tileErrorCountRef.current === 0) return
    logger.warn(
      `[OfflineMapsScreen] ${tileErrorCountRef.current} tile error(s) total downloading '${packName}', last:`,
      lastTileErrorRef.current
    )
    tileErrorCountRef.current = 0
  }, [])

  const handleTileError = useCallback(
    (packName: string) => (err: unknown) => {
      if (activePackNameRef.current !== packName) return
      tileErrorCountRef.current += 1
      lastTileErrorRef.current = err
      if (tileErrorCountRef.current === 1) {
        logger.warn(`[OfflineMapsScreen] Tile error downloading '${packName}':`, err)
      }
    },
    []
  )

  const loadAreasRef = useRef<() => Promise<void>>(async () => {})

  const finishDownload = useCallback(async (packName: string) => {
    try {
      const entry = (await loadOfflineAreaBounds()).find((b) => b.name === packName)
      if (entry) await saveOfflineAreaBounds({ ...entry, downloadedAt: Date.now() })
    } catch (err) {
      logger.error("[OfflineMapsScreen] Failed to stamp completion:", err)
    }
    await loadAreasRef.current()
  }, [])

  const handleProgress = useCallback(
    (packName: string) => (status: OfflinePackStatus) => {
      if (activePackNameRef.current !== packName) return
      setDownloadProgress(status)
      if (status.state !== DOWNLOAD_STATE.COMPLETE) return
      reportTileErrors(packName)
      activePackNameRef.current = null
      setDownload(null)
      setDownloadProgress(null)
      setName("")
      finishDownload(packName).catch(() => {})
    },
    [reportTileErrors, finishDownload]
  )

  const loadAreas = useCallback(async () => {
    const [packsResult, entriesResult, styleResult] = await Promise.allSettled([
      loadOfflineAreas(),
      loadOfflineAreaBounds(),
      NativeLocationService.getSetting("mapStyleUrlLight")
    ])
    if (packsResult.status === "rejected") {
      logger.error("[OfflineMapsScreen] Failed to load offline areas:", packsResult.reason)
    }
    if (styleResult.status === "rejected") {
      logger.error("[OfflineMapsScreen] Failed to read the map style:", styleResult.reason)
    }
    const packs = packsResult.status === "fulfilled" ? packsResult.value : null
    const entries = entriesResult.status === "fulfilled" ? entriesResult.value : null
    if (styleResult.status === "fulfilled") setCurrentStyleUrl(styleResult.value || MAP_STYLE_URL_LIGHT)
    if (!packs) return

    const keep = new Set(packs.map((p) => p.name))
    if (entries) {
      if (entries.some((e) => !keep.has(e.name))) await pruneOfflineAreaBounds(keep)
      setAreaBounds(entries.filter((e) => keep.has(e.name)))
    }
    setAreas(packs)

    // Only a pack native already reports active is ever attached: observing one sets it active.
    const active = packs.find((p) => p.isActive)
    if (!active || activePackNameRef.current !== null || createPendingRef.current) return
    activePackNameRef.current = active.name
    const status = await subscribeOfflinePack(active.name, handleProgress(active.name), handleTileError(active.name))
    if (!status) {
      activePackNameRef.current = null
      return
    }
    setDownload({ name: active.name, bounds: active.bounds })
    setName(active.name)
    handleProgress(active.name)(status)
  }, [handleProgress, handleTileError])
  loadAreasRef.current = loadAreas

  useFocusEffect(
    useCallback(() => {
      loadAreas()
    }, [loadAreas])
  )

  const noteBounds = useCallback((bounds: Bounds) => {
    currentBoundsRef.current = bounds
    setEstimate(estimateFor(bounds))
  }, [])

  const handleRegionChange = useCallback(
    (payload: RegionChangePayload) => {
      if (payload.isUserInteraction) setIsCentered(false)
      if (payload.bounds) noteBounds(payload.bounds)
    },
    [noteBounds]
  )

  const handleMapReady = useCallback(async () => {
    try {
      const bounds = await mapRef.current?.mapView?.getBounds()
      if (bounds) noteBounds(bounds)
    } catch (err) {
      logger.warn("[OfflineMapsScreen] Map bounds unavailable on ready:", err)
    }
  }, [noteBounds])

  const handleCenterMe = useCallback(() => {
    const target = coords ?? lastFix
    if (!target || !mapRef.current?.camera) return
    mapRef.current.camera.flyTo({
      center: [target.longitude, target.latitude],
      zoom: DEFAULT_MAP_ZOOM,
      duration: MAP_ANIMATION_DURATION_MS
    })
    setIsCentered(true)
  }, [coords, lastFix])

  const fitToArea = useCallback((bounds: Bounds) => {
    if (!mapRef.current?.camera) return
    mapRef.current.camera.fitBounds(bounds, { padding: FIT_PADDING, duration: MAP_ANIMATION_DURATION_MS })
    setIsCentered(false)
  }, [])

  const handleAreaPress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const pressed: string | undefined = event.nativeEvent.features?.[0]?.properties?.name
      const area = pressed ? areas?.find((a) => a.name === pressed) : undefined
      if (area?.bounds) fitToArea(area.bounds)
    },
    [areas, fitToArea]
  )

  const beginDownload = useCallback(
    async (packName: string, bounds: Bounds) => {
      activePackNameRef.current = packName
      tileErrorCountRef.current = 0
      setDownload({ name: packName, bounds })
      setDownloadProgress(null)
      createPendingRef.current = true
      const { ne, sw } = cornersOf(bounds)
      try {
        await createOfflinePack(packName, ne, sw, handleProgress(packName), handleTileError(packName))
      } catch (err) {
        createPendingRef.current = false
        // Cancelled while pending: native created nothing, so there is nothing to say.
        if (activePackNameRef.current !== packName) return
        logger.error("[OfflineMapsScreen] Failed to start download:", err)
        activePackNameRef.current = null
        setDownload(null)
        showAlert("Could not start the download", "Nothing was downloaded. Try again.", "error")
        return
      }
      createPendingRef.current = false
      if (activePackNameRef.current !== packName) {
        try {
          await deleteOfflineArea(packName)
        } catch (err) {
          logger.error("[OfflineMapsScreen] Failed to delete a pack cancelled during creation:", err)
        }
        return
      }
      try {
        await saveOfflineAreaBounds({ name: packName, ne, sw, styleUrl: currentStyleUrl ?? MAP_STYLE_URL_LIGHT })
      } catch (err) {
        logger.error("[OfflineMapsScreen] Failed to save area bounds:", err)
      }
      await loadAreas()
    },
    [currentStyleUrl, handleProgress, handleTileError, loadAreas]
  )

  const handleDownload = useCallback(async () => {
    const trimmed = name.trim()
    const bounds = currentBoundsRef.current
    if (busyRef.current || !trimmed || !bounds || !estimate) return
    busyRef.current = true
    setBusy({ kind: "start", name: trimmed })
    try {
      if (!(await NativeLocationService.isNetworkAvailable())) {
        showAlert(NO_CONNECTION.title, NO_CONNECTION.message, "warning")
        return
      }
      const fresh = await loadOfflineAreas()
      setAreas(fresh)
      if (fresh.some((a) => a.name === trimmed)) return
      const availableMB = await NativeLocationService.getAvailableStorageMB()
      if (availableMB > 0 && estimate.bytes / BYTES_PER_MB > availableMB * STORAGE_HEADROOM) {
        showAlert("Not enough storage", storageMessage(estimate, availableMB), "warning")
        return
      }
      const metered = !(await NativeLocationService.isUnmeteredConnection())
      if (!(await showConfirm({ ...downloadConfirm(trimmed, estimate, metered), destructive: false }))) return
    } catch (err) {
      logger.error("[OfflineMapsScreen] Failed to start download:", err)
      showAlert("Could not start the download", "Nothing was downloaded. Try again.", "error")
      return
    } finally {
      busyRef.current = false
      setBusy(null)
    }
    await beginDownload(trimmed, bounds)
  }, [name, estimate, beginDownload])

  const handleCancelDownload = useCallback(async () => {
    const packName = activePackNameRef.current
    if (!packName || busyRef.current) return
    activePackNameRef.current = null
    if (createPendingRef.current) {
      setDownload(null)
      setDownloadProgress(null)
      return
    }
    busyRef.current = true
    setBusy({ kind: "stop", name: packName })
    try {
      await deleteOfflineArea(packName)
      await removeOfflineAreaBounds(packName)
    } catch (err) {
      logger.error("[OfflineMapsScreen] Failed to stop the download:", err)
      showAlert("Could not stop the download", "The download may still be running. Try again.", "error")
    } finally {
      busyRef.current = false
      setBusy(null)
      setDownload(null)
      setDownloadProgress(null)
    }
    await loadAreas()
  }, [loadAreas])

  const handleCancelArea = useCallback(
    async (area: OfflineAreaInfo) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy({ kind: "stop", name: area.name })
      try {
        await deleteOfflineArea(area.name)
        await removeOfflineAreaBounds(area.name)
      } catch (err) {
        logger.error("[OfflineMapsScreen] Failed to stop the download:", err)
        showAlert("Could not stop the download", "The download may still be running. Try again.", "error")
      } finally {
        busyRef.current = false
        setBusy(null)
      }
      await loadAreas()
    },
    [loadAreas]
  )

  const handleRedownload = useCallback(
    async (area: OfflineAreaInfo) => {
      if (busyRef.current || download) return
      busyRef.current = true
      setBusy({ kind: "redownload", name: area.name })
      let go = false
      try {
        if (!area.bounds) {
          showAlert(
            "Cannot download again",
            "This area's extent could not be read. Delete it and download it again.",
            "warning"
          )
          return
        }
        if (!(await NativeLocationService.isNetworkAvailable())) {
          showAlert(NO_CONNECTION.title, NO_CONNECTION.message, "warning")
          return
        }
        const metered = !(await NativeLocationService.isUnmeteredConnection())
        const areaEstimate = estimateFor(area.bounds)
        if (!(await showConfirm({ ...redownloadConfirm(area.name, areaEstimate, metered), destructive: false }))) return
        await deleteOfflineArea(area.name)
        go = true
      } catch (err) {
        logger.error("[OfflineMapsScreen] Failed to download again:", err)
        showAlert(
          "Could not download again",
          "The old tiles could not be removed, so nothing was downloaded. Try again.",
          "error"
        )
      } finally {
        busyRef.current = false
        setBusy(null)
      }
      if (!go || !area.bounds) return
      setName(area.name)
      await beginDownload(area.name, area.bounds)
    },
    [download, beginDownload]
  )

  const handleDelete = useCallback(
    async (area: OfflineAreaInfo) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy({ kind: "delete", name: area.name })
      try {
        const isLast = (areas?.length ?? 0) === 1
        if (!(await showConfirm({ ...deleteAreaConfirm(area.name, area.sizeBytes, isLast), destructive: true }))) return
        await deleteOfflineArea(area.name)
        await removeOfflineAreaBounds(area.name)
      } catch (err) {
        logger.error("[OfflineMapsScreen] Failed to delete area:", err)
        showAlert("Could not delete the area", "Its tiles are still on the device. Try again.", "error")
      } finally {
        busyRef.current = false
        setBusy(null)
      }
      await loadAreas()
    },
    [areas, loadAreas]
  )

  const savedAreasGeoJSON = useMemo(() => areasCollection(listAreas), [listAreas])
  const layerStyles = useMemo(
    () => ({
      savedFill: { fillColor: colors.success, fillOpacity: 0.1 },
      savedLine: { lineColor: colors.success, lineWidth: 1.5, lineOpacity: 0.6 },
      frameFill: { fillColor: colors.info, fillOpacity: 0.2 },
      frameLine: { lineColor: colors.info, lineWidth: 1.5, lineOpacity: 0.6 }
    }),
    [colors.success, colors.info]
  )
  const downloadAreaGeoJSON = download?.bounds ? areaFeature(download.name, download.bounds) : null
  const entryFor = useCallback((areaName: string) => areaBounds.find((b) => b.name === areaName), [areaBounds])
  const toneColor = (tone: RowTone) =>
    tone === "active" ? colors.primary : tone === "attention" ? colors.warning : undefined
  const pct = downloadProgress?.percentage ?? 0
  const downloadDisabled =
    areas === null || estimate === null || name.trim() === "" || nameError !== undefined || busy !== null

  return (
    <Container>
      <View
        testID="offline-map"
        style={[styles.map, { height: mapHeight }, download !== null && { borderColor: colors.primary }]}
      >
        {lastFix !== undefined && (
          <ColotaMapView
            ref={mapRef}
            initialCenter={lastFix ? [lastFix.longitude, lastFix.latitude] : WORLD_CENTER}
            initialZoom={lastFix ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM}
            onRegionDidChange={handleRegionChange}
            onMapReady={handleMapReady}
          >
            {savedAreasGeoJSON.features.length > 0 && (
              <GeoJSONSource id="saved-areas" data={savedAreasGeoJSON} onPress={handleAreaPress}>
                <Layer id="saved-areas-fill" type="fill" style={layerStyles.savedFill} />
                <Layer id="saved-areas-border" type="line" style={layerStyles.savedLine} />
              </GeoJSONSource>
            )}
            {downloadAreaGeoJSON && (
              <GeoJSONSource id="offline-area" data={downloadAreaGeoJSON}>
                <Layer id="offline-area-fill" type="fill" style={layerStyles.frameFill} />
                <Layer id="offline-area-border" type="line" style={layerStyles.frameLine} />
              </GeoJSONSource>
            )}
          </ColotaMapView>
        )}
        <MapCenterButton visible={!isCentered && !!(coords ?? lastFix)} onPress={handleCenterMe} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{INTRO_LINE}</Text>

        <View style={styles.section}>
          <SectionTitle>New area</SectionTitle>
          <Card>
            <TextField
              testID="area-name-input"
              label="Name"
              placeholder="Home area, Trail…"
              value={name}
              onChangeText={setName}
              error={nameError}
              disabled={download !== null}
            />
          </Card>
          {download === null ? (
            <View>
              <Button
                testID="download-btn"
                title="Download area"
                loading={busy?.kind === "start"}
                disabled={downloadDisabled}
                onPress={handleDownload}
              />
              <FieldMessage variant={estimate?.large ? "warning" : "info"}>{downloadLine(estimate, name)}</FieldMessage>
            </View>
          ) : (
            <View>
              <View style={styles.progressHeader}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.progressLabel, { color: colors.text }]}>Downloading {download.name}</Text>
              </View>
              <View
                testID="download-progress"
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`Downloading ${download.name}`}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
                style={[styles.progressTrack, { backgroundColor: colors.well }]}
              >
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${pct}%` }]} />
              </View>
              <FieldMessage>{progressCaption(downloadProgress)}</FieldMessage>
              <Button
                testID="cancel-download-btn"
                variant="ghost"
                color={colors.error}
                icon={X}
                title="Cancel download"
                loading={busy?.kind === "stop"}
                disabled={busy !== null}
                onPress={handleCancelDownload}
              />
            </View>
          )}
        </View>

        {areas !== null && listAreas.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Saved areas</SectionTitle>
            <Card rows>
              {listAreas.map((area, i) => {
                const row = describeArea(area, entryFor(area.name), currentStyleUrl)
                const mine = (kind: Busy["kind"]) => busy?.kind === kind && busy.name === area.name
                return (
                  <React.Fragment key={area.name}>
                    {i > 0 && <Divider tight inset />}
                    <ListItem
                      testID={`area-${area.name}`}
                      icon={row.icon}
                      iconColor={toneColor(row.tone)}
                      label={area.name}
                      sub={row.sub}
                      subLines={2}
                      accessibilityHint={ROW_HINT}
                      onPress={() => area.bounds && fitToArea(area.bounds)}
                      trailing={
                        area.isActive ? (
                          <IconButton
                            icon={X}
                            tone="danger"
                            accessibilityLabel={`Stop downloading ${area.name}`}
                            loading={mine("stop")}
                            disabled={busy !== null}
                            onPress={() => handleCancelArea(area)}
                            testID={`stop-btn-${area.name}`}
                          />
                        ) : (
                          <View style={styles.rowActions}>
                            <IconButton
                              icon={RefreshCw}
                              tone="primary"
                              accessibilityLabel={`Download ${area.name} again`}
                              loading={mine("redownload")}
                              disabled={download !== null || busy !== null}
                              onPress={() => handleRedownload(area)}
                              testID={`refresh-btn-${area.name}`}
                            />
                            <IconButton
                              icon={Trash2}
                              tone="danger"
                              accessibilityLabel={`Delete ${area.name}`}
                              loading={mine("delete")}
                              disabled={busy !== null}
                              onPress={() => handleDelete(area)}
                              testID={`delete-btn-${area.name}`}
                            />
                          </View>
                        )
                      }
                    />
                  </React.Fragment>
                )
              })}
            </Card>
          </View>
        )}

        {areas !== null && listAreas.length === 0 && download === null && (
          <EmptyState
            title="No saved areas yet"
            hint="Download map tiles to browse your tracks offline while hiking or camping"
            style={styles.empty}
          />
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  // The border is always drawn and only changes colour: a width that comes and goes on a
  // view that clips leaves its children unpainted on Android.
  map: { overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  section: {
    marginBottom: space.xl
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.lg,
    marginBottom: space.md
  },
  progressLabel: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  progressTrack: { height: 6, borderRadius: radius.pill, overflow: "hidden" },
  progressFill: { height: "100%" },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg
  },
  // the list around it already insets its rows
  empty: { paddingHorizontal: 0 }
})
