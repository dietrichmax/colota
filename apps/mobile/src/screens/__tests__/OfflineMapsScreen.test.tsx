import React from "react"
import { Dimensions, StyleSheet } from "react-native"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { GEOFENCE_ZOOM_PADDING, MAP_ANIMATION_DURATION_MS } from "../../constants"

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    GeoJSONSource: ({ id, data, children }: any) =>
      R.createElement(View, { testID: `source-${id}`, accessibilityValue: { text: JSON.stringify(data) } }, children),
    Layer: () => null
  }
})

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react")
    R.useEffect(() => {
      const cleanup = cb()
      return typeof cleanup === "function" ? cleanup : undefined
    }, [cb])
  }
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors, mode: "light" })
}))

let mockCoords: { latitude: number; longitude: number; accuracy: number } | null = null
jest.mock("../../contexts/TrackingProvider", () => ({
  useCoords: () => mockCoords
}))

const mockIsNetworkAvailable = jest.fn()
const mockIsUnmeteredConnection = jest.fn()
const mockGetAvailableStorageMB = jest.fn()
const mockGetMostRecentLocation = jest.fn()
const mockGetSetting = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    isNetworkAvailable: (...a: any[]) => mockIsNetworkAvailable(...a),
    isUnmeteredConnection: (...a: any[]) => mockIsUnmeteredConnection(...a),
    getAvailableStorageMB: (...a: any[]) => mockGetAvailableStorageMB(...a),
    getMostRecentLocation: (...a: any[]) => mockGetMostRecentLocation(...a),
    getSetting: (...a: any[]) => mockGetSetting(...a)
  }
}))

const mockShowAlert = jest.fn()
const mockShowConfirm = jest.fn()
jest.mock("../../services/modalService", () => ({
  showAlert: (...a: any[]) => mockShowAlert(...a),
  showConfirm: (...a: any[]) => mockShowConfirm(...a)
}))

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
jest.mock("../../utils/logger", () => ({
  logger: {
    error: (...a: any[]) => mockLogger.error(...a),
    warn: (...a: any[]) => mockLogger.warn(...a),
    info: (...a: any[]) => mockLogger.info(...a),
    debug: (...a: any[]) => mockLogger.debug(...a)
  }
}))

const mockLoadOfflineAreas = jest.fn()
const mockLoadOfflineAreaBounds = jest.fn()
const mockCreateOfflinePack = jest.fn()
const mockDeleteOfflineArea = jest.fn()
const mockSaveOfflineAreaBounds = jest.fn()
const mockRemoveOfflineAreaBounds = jest.fn()
const mockSubscribeOfflinePack = jest.fn()
const mockPruneOfflineAreaBounds = jest.fn()
const mockUnsubscribeOfflinePack = jest.fn()
const mockEstimateSizeLabel = jest.fn()
const mockEstimateSizeBytes = jest.fn()
const mockWillExceedTileLimit = jest.fn()
jest.mock("../../components/features/map/OfflinePackManager", () => ({
  DOWNLOAD_STATE: { INACTIVE: "inactive", ACTIVE: "active", COMPLETE: "complete" },
  loadOfflineAreas: (...a: any[]) => mockLoadOfflineAreas(...a),
  loadOfflineAreaBounds: (...a: any[]) => mockLoadOfflineAreaBounds(...a),
  createOfflinePack: (...a: any[]) => mockCreateOfflinePack(...a),
  deleteOfflineArea: (...a: any[]) => mockDeleteOfflineArea(...a),
  saveOfflineAreaBounds: (...a: any[]) => mockSaveOfflineAreaBounds(...a),
  removeOfflineAreaBounds: (...a: any[]) => mockRemoveOfflineAreaBounds(...a),
  subscribeOfflinePack: (...a: any[]) => mockSubscribeOfflinePack(...a),
  pruneOfflineAreaBounds: (...a: any[]) => mockPruneOfflineAreaBounds(...a),
  unsubscribeOfflinePack: (...a: any[]) => mockUnsubscribeOfflinePack(...a),
  estimateSizeLabel: (...a: any[]) => mockEstimateSizeLabel(...a),
  estimateSizeBytes: (...a: any[]) => mockEstimateSizeBytes(...a),
  willExceedTileLimit: (...a: any[]) => mockWillExceedTileLimit(...a)
}))

const BOUNDS: [number, number, number, number] = [13.4, 52.5, 13.5, 52.6]
const mockFitBounds = jest.fn()
const mockFlyTo = jest.fn()
const mockGetBounds = jest.fn()
const mockMapProps = jest.fn()
jest.mock("../../components/features/map/ColotaMapView", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    ColotaMapView: R.forwardRef((props: any, ref: any) => {
      R.useImperativeHandle(ref, () => ({
        camera: { fitBounds: mockFitBounds, flyTo: mockFlyTo },
        mapView: { getBounds: mockGetBounds }
      }))
      mockMapProps(props)
      return R.createElement(
        View,
        { testID: "colota-map" },
        R.createElement(Pressable, { testID: "map-ready", onPress: () => props.onMapReady?.() }),
        R.createElement(Pressable, {
          testID: "map-pan",
          onPress: () =>
            props.onRegionDidChange?.({ heading: 0, isUserInteraction: true, bounds: [13.4, 52.5, 13.5, 52.6] })
        }),
        props.children
      )
    })
  }
})

jest.mock("../../components/features/map/MapCenterButton", () => {
  const R = require("react")
  const { Pressable } = require("react-native")
  return {
    MapCenterButton: ({ visible, onPress }: any) =>
      visible ? R.createElement(Pressable, { testID: "center-btn", onPress }) : null
  }
})

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  const stubs = require("../../testing/componentStubs")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Divider: () => null,
    TextField: stubs.TextFieldStub,
    IconButton: stubs.IconButtonStub,
    EmptyState: stubs.EmptyStateStub,
    FieldMessage: ({ children, variant }: any) =>
      R.createElement(Text, { accessibilityValue: { text: variant ?? "info" } }, children),
    Button: ({ title, onPress, disabled, loading, testID }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          disabled: disabled || loading,
          accessibilityState: { disabled: !!disabled, busy: !!loading }
        },
        R.createElement(Text, null, title)
      ),
    ListItem: ({ label, sub, onPress, testID, trailing, iconColor }: any) =>
      R.createElement(
        View,
        { testID, accessibilityValue: { text: iconColor ?? "" } },
        R.createElement(Pressable, { testID: `${testID}-press`, onPress }, R.createElement(Text, null, label)),
        sub ? R.createElement(Text, null, sub) : null,
        trailing
      )
  }
})

import { OfflineMapsScreen } from "../OfflineMapsScreen"

const area = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  sizeBytes: 2_097_152,
  isComplete: true,
  isActive: false,
  bounds: BOUNDS,
  ...over
})
const entry = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  ne: [13.5, 52.6],
  sw: [13.4, 52.5],
  styleUrl: "https://tiles.example/light.json",
  ...over
})

const mapBox = (api: ReturnType<typeof render>) => StyleSheet.flatten(api.getByTestId("offline-map").props.style)

const renderScreen = () => render(<OfflineMapsScreen navigation={{} as any} />)

/** Renders, lets the database answer, then lets the map report its bounds. */
async function renderReady(name = "") {
  const api = renderScreen()
  await waitFor(() => expect(api.getByTestId("map-ready")).toBeTruthy())
  await act(async () => {
    fireEvent.press(api.getByTestId("map-ready"))
  })
  if (name) fireEvent.changeText(api.getByTestId("area-name-input"), name)
  await waitFor(() => expect(mockLoadOfflineAreas).toHaveBeenCalled())
  return api
}

async function press(api: ReturnType<typeof render>, testID: string) {
  await act(async () => {
    fireEvent.press(api.getByTestId(testID))
  })
}

const progressOf = (call = 0) => mockCreateOfflinePack.mock.calls[call][3] as (status: unknown) => void
const status = (percentage: number, over: Record<string, unknown> = {}) => ({
  state: "active",
  percentage,
  completedResourceCount: 0,
  requiredResourceCount: 0,
  completedResourceSize: 0,
  ...over
})

beforeEach(() => {
  jest.clearAllMocks()
  mockCoords = null
  mockIsNetworkAvailable.mockResolvedValue(true)
  mockIsUnmeteredConnection.mockResolvedValue(true)
  mockGetAvailableStorageMB.mockResolvedValue(1000)
  mockGetMostRecentLocation.mockResolvedValue({ latitude: 52.52, longitude: 13.405, accuracy: 8 })
  mockGetSetting.mockResolvedValue("https://tiles.example/light.json")
  mockLoadOfflineAreas.mockResolvedValue([])
  mockLoadOfflineAreaBounds.mockResolvedValue([])
  mockCreateOfflinePack.mockResolvedValue(undefined)
  mockDeleteOfflineArea.mockResolvedValue(undefined)
  mockSaveOfflineAreaBounds.mockResolvedValue(undefined)
  mockRemoveOfflineAreaBounds.mockResolvedValue(undefined)
  mockSubscribeOfflinePack.mockResolvedValue(null)
  mockPruneOfflineAreaBounds.mockResolvedValue(undefined)
  mockGetBounds.mockResolvedValue(BOUNDS)
  mockEstimateSizeLabel.mockReturnValue("~5 MB")
  mockEstimateSizeBytes.mockReturnValue(5 * 1024 * 1024)
  mockWillExceedTileLimit.mockReturnValue(false)
  mockShowConfirm.mockResolvedValue(true)
})

describe("the map", () => {
  // Tiles that open on the world view and then jump to the fix read as a broken map.
  it("draws no tiles until the database has answered, then opens on the last fix", async () => {
    let answer: (v: unknown) => void = () => {}
    mockGetMostRecentLocation.mockReturnValue(new Promise((r) => (answer = r)))
    const api = renderScreen()

    expect(api.queryByTestId("colota-map")).toBeNull()
    await act(async () => answer({ latitude: 52.52, longitude: 13.405, accuracy: 8 }))

    expect(api.getByTestId("colota-map")).toBeTruthy()
    expect(mockMapProps.mock.calls.at(-1)![0]).toMatchObject({ initialCenter: [13.405, 52.52] })
  })

  it("opens on the world view when nothing was ever recorded", async () => {
    mockGetMostRecentLocation.mockResolvedValue(null)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("colota-map")).toBeTruthy())
    expect(mockMapProps.mock.calls.at(-1)![0]).toMatchObject({ initialCenter: [0, 20] })
  })

  it("takes half the viewport, with a border that is always drawn and only recoloured", async () => {
    const api = await renderReady()
    expect(mapBox(api)).toMatchObject({
      height: Math.round(Dimensions.get("window").height * 0.5),
      borderWidth: 2,
      borderColor: "transparent"
    })
  })

  // With tracking off the stored fix is the only way back to where the user is.
  it("offers the centre disc after a pan even with tracking off, and flies to the stored fix", async () => {
    const api = await renderReady()
    expect(api.queryByTestId("center-btn")).toBeNull()

    await press(api, "map-pan")
    expect(api.getByTestId("center-btn")).toBeTruthy()

    await press(api, "center-btn")
    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [13.405, 52.52], duration: MAP_ANIMATION_DURATION_MS })
    )
    expect(api.queryByTestId("center-btn")).toBeNull()
  })
})

describe("framing and naming", () => {
  it("keeps Download area disabled until the map reports bounds, and says so", async () => {
    mockGetBounds.mockResolvedValue(undefined)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("download-btn")).toBeTruthy())

    expect(api.getByTestId("download-btn").props.accessibilityState.disabled).toBe(true)
    expect(api.getByText("Waiting for the map.")).toBeTruthy()
  })

  it("asks for a name once the estimate is in, then enables the button", async () => {
    const api = await renderReady()
    expect(api.getByText("~5 MB estimated. Name the area to download it.")).toBeTruthy()
    expect(api.getByTestId("download-btn").props.accessibilityState.disabled).toBe(true)

    fireEvent.changeText(api.getByTestId("area-name-input"), "my park")
    expect(api.getByText("~5 MB estimated.")).toBeTruthy()
    expect(api.getByTestId("download-btn").props.accessibilityState.disabled).toBe(false)
  })

  // The estimator stops counting at the tile cap, so the line is a floor and a warning.
  it("turns the line into a warning floor on a capped frame", async () => {
    mockEstimateSizeLabel.mockReturnValue("~470 MB")
    mockWillExceedTileLimit.mockReturnValue(true)
    const api = await renderReady("Alps")

    const line = api.getByText("At least ~470 MB. Zoom in to download less.")
    expect(line.props.accessibilityValue.text).toBe("warning")
  })

  it("puts a taken name on the field and keeps the button disabled, with no dialog", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("my park")])
    const api = await renderReady("my park")

    expect(api.getByText('An area named "my park" already exists.')).toBeTruthy()
    expect(api.getByTestId("download-btn").props.accessibilityState.disabled).toBe(true)
    expect(mockShowAlert).not.toHaveBeenCalled()
  })
})

describe("starting a download", () => {
  it("refuses without a network and creates nothing", async () => {
    mockIsNetworkAvailable.mockResolvedValue(false)
    const api = await renderReady("my park")

    await press(api, "download-btn")

    expect(mockShowAlert).toHaveBeenCalledWith(
      "No connection",
      expect.stringContaining("Saved areas still work"),
      "warning"
    )
    expect(mockCreateOfflinePack).not.toHaveBeenCalled()
  })

  it("refuses when the estimate would not fit, naming both numbers", async () => {
    mockGetAvailableStorageMB.mockResolvedValue(4)
    const api = await renderReady("my park")

    await press(api, "download-btn")

    expect(mockShowAlert).toHaveBeenCalledWith(
      "Not enough storage",
      "~5 MB is needed and the device has 4.0 MB free.",
      "warning"
    )
    expect(mockCreateOfflinePack).not.toHaveBeenCalled()
  })

  // One dialog on the happy path: the mobile-data warning is a sentence in it, not a second dialog.
  it("asks once, carrying the estimate and the mobile-data sentence when metered", async () => {
    mockIsUnmeteredConnection.mockResolvedValue(false)
    mockShowConfirm.mockResolvedValue(false)
    const api = await renderReady("my park")

    await press(api, "download-btn")

    expect(mockShowConfirm).toHaveBeenCalledTimes(1)
    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Download "my park"?',
        message: "~5 MB estimated. You are on mobile data, not WiFi.",
        confirmText: "Download"
      })
    )
    expect(mockCreateOfflinePack).not.toHaveBeenCalled()
  })

  it("creates the pack from the framed corners, saves the extent without a date, and shows the block", async () => {
    let finish: () => void = () => {}
    mockCreateOfflinePack.mockReturnValue(new Promise<void>((r) => (finish = r)))
    const api = await renderReady("my park")

    await press(api, "download-btn")

    expect(mockCreateOfflinePack).toHaveBeenCalledWith(
      "my park",
      [13.5, 52.6],
      [13.4, 52.5],
      expect.any(Function),
      expect.any(Function)
    )
    expect(api.getByText("Downloading my park")).toBeTruthy()
    expect(api.getByText("Starting…")).toBeTruthy()
    expect(mapBox(api).borderColor).toBe(lightColors.primary)

    await act(async () => finish())
    expect(mockSaveOfflineAreaBounds).toHaveBeenCalledWith({
      name: "my park",
      ne: [13.5, 52.6],
      sw: [13.4, 52.5],
      styleUrl: "https://tiles.example/light.json"
    })
    expect(mockSaveOfflineAreaBounds.mock.calls[0][0]).not.toHaveProperty("downloadedAt")
  })

  it("moves the track and the caption with progress, and keeps the running pack out of the list", async () => {
    const api = await renderReady("my park")
    // Once the pack exists native reports it active; the reload after the create must not row it.
    mockLoadOfflineAreas.mockImplementation(() =>
      Promise.resolve(
        mockCreateOfflinePack.mock.calls.length > 0
          ? [area("my park", { isActive: true, isComplete: false, sizeBytes: 0 })]
          : []
      )
    )
    await press(api, "download-btn")

    await act(async () => progressOf()(status(42, { completedResourceSize: 5_347_737 })))

    expect(api.getByTestId("download-progress").props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 })
    expect(api.getByText("42% · 5.1 MB so far")).toBeTruthy()
    expect(api.queryByTestId("area-my park")).toBeNull()
  })

  /**
   * The date is the finish, not the start, and it is stamped by re-saving the entry the create
   * wrote, so an interrupted download never carries a completion date.
   */
  it("stamps the completion date, clears the field and reloads on COMPLETE", async () => {
    mockLoadOfflineAreaBounds.mockResolvedValue([entry("my park")])
    const api = await renderReady("my park")
    await press(api, "download-btn")
    const reloads = mockLoadOfflineAreas.mock.calls.length

    await act(async () => progressOf()(status(100, { state: "complete", completedResourceSize: 2_097_152 })))

    await waitFor(() =>
      expect(mockSaveOfflineAreaBounds).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "my park", downloadedAt: expect.any(Number) })
      )
    )
    expect(api.getByTestId("area-name-input").props.value).toBe("")
    expect(mockLoadOfflineAreas.mock.calls.length).toBeGreaterThan(reloads)
    expect(api.queryByText(/Downloading my park/)).toBeNull()
  })

  // A create that fails did not create a pack, so there is nothing to clean up and nothing to retry.
  it("alerts on a rejected create, deletes nothing, writes no bounds and never retries", async () => {
    const api = await renderReady("my park")
    jest.useFakeTimers()
    mockCreateOfflinePack.mockRejectedValue(new Error("native said no"))

    await press(api, "download-btn")

    expect(mockLogger.error).toHaveBeenCalledWith("[OfflineMapsScreen] Failed to start download:", expect.any(Error))
    expect(mockShowAlert).toHaveBeenCalledWith(
      "Could not start the download",
      "Nothing was downloaded. Try again.",
      "error"
    )
    expect(mockDeleteOfflineArea).not.toHaveBeenCalled()
    expect(mockSaveOfflineAreaBounds).not.toHaveBeenCalled()
    expect(api.getByTestId("download-btn")).toBeTruthy()

    await act(async () => {
      jest.advanceTimersByTime(60_000)
    })
    expect(mockCreateOfflinePack).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  })

  it("logs the first tile error and then only a total", async () => {
    const api = await renderReady("my park")
    await press(api, "download-btn")
    const onError = mockCreateOfflinePack.mock.calls[0][4] as (err: unknown) => void

    await act(async () => {
      onError(new Error("tile 1"))
      onError(new Error("tile 2"))
      onError(new Error("tile 3"))
      progressOf()(status(100, { state: "complete" }))
    })

    const lines = mockLogger.warn.mock.calls.map((c) => c[0] as string)
    expect(lines.filter((l) => l.startsWith("[OfflineMapsScreen] Tile error downloading"))).toHaveLength(1)
    expect(lines).toContain("[OfflineMapsScreen] 3 tile error(s) total downloading 'my park', last:")
  })
})

describe("cancelling", () => {
  /**
   * Native only answers the create later. A cancel in that window has nothing to delete yet, so
   * the post-create continuation deletes the pack exactly once, and no bounds are ever written.
   */
  it("deletes a pack cancelled during the create exactly once, after native answers", async () => {
    let finish: () => void = () => {}
    mockCreateOfflinePack.mockReturnValue(new Promise<void>((r) => (finish = r)))
    const api = await renderReady("my park")
    await press(api, "download-btn")

    await press(api, "cancel-download-btn")
    expect(mockDeleteOfflineArea).not.toHaveBeenCalled()
    expect(api.getByTestId("download-btn")).toBeTruthy()

    await act(async () => finish())
    expect(mockDeleteOfflineArea).toHaveBeenCalledTimes(1)
    expect(mockDeleteOfflineArea).toHaveBeenCalledWith("my park")
    expect(mockSaveOfflineAreaBounds).not.toHaveBeenCalled()
  })

  it("deletes, removes the bounds and reloads on a cancel after the create", async () => {
    const api = await renderReady("my park")
    await press(api, "download-btn")
    const reloads = mockLoadOfflineAreas.mock.calls.length

    await press(api, "cancel-download-btn")

    expect(mockDeleteOfflineArea).toHaveBeenCalledWith("my park")
    expect(mockRemoveOfflineAreaBounds).toHaveBeenCalledWith("my park")
    expect(mockLoadOfflineAreas.mock.calls.length).toBeGreaterThan(reloads)
    expect(api.getByTestId("download-btn")).toBeTruthy()
  })

  it("logs, alerts and reloads when the stop fails", async () => {
    const api = await renderReady("my park")
    await press(api, "download-btn")
    mockDeleteOfflineArea.mockRejectedValueOnce(new Error("busy"))

    await press(api, "cancel-download-btn")

    expect(mockLogger.error).toHaveBeenCalledWith("[OfflineMapsScreen] Failed to stop the download:", expect.any(Error))
    expect(mockShowAlert).toHaveBeenCalledWith("Could not stop the download", expect.any(String), "error")
  })
})

describe("coming back to a download", () => {
  // A pack native still reports active belongs to the progress block, not to the list row.
  it("re-attaches to a pack native reports active and shows its progress", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("trail", { isActive: true, isComplete: false, sizeBytes: 0 })])
    mockSubscribeOfflinePack.mockResolvedValue(status(37, { completedResourceSize: 1_048_576 }))
    const api = await renderReady()

    expect(mockSubscribeOfflinePack).toHaveBeenCalledWith("trail", expect.any(Function), expect.any(Function))
    expect(api.getByText("Downloading trail")).toBeTruthy()
    expect(api.getByText("37% · 1.0 MB so far")).toBeTruthy()
    expect(api.queryByTestId("area-trail")).toBeNull()
  })

  // Observing a pack sets it active natively, so attaching to an inactive one would start it.
  it("never subscribes to a pack that is not already active", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("done"), area("half", { isComplete: false, sizeBytes: 100 })])
    await renderReady()
    expect(mockSubscribeOfflinePack).not.toHaveBeenCalled()
  })

  it("rows a second active pack as downloading, with a stop control", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      area("mine", { isActive: true, isComplete: false, sizeBytes: 0 }),
      area("theirs", { isActive: true, isComplete: false, sizeBytes: 0 })
    ])
    mockSubscribeOfflinePack.mockResolvedValue(status(10))
    const api = await renderReady()

    expect(api.getByTestId("area-theirs")).toBeTruthy()
    expect(api.getByText("Downloading…")).toBeTruthy()
    expect(api.getByTestId("stop-btn-theirs")).toBeTruthy()
    expect(api.queryByTestId("refresh-btn-theirs")).toBeNull()
  })
})

describe("the saved list", () => {
  it("says what each row holds, and tints only the rows that need attention", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      area("fresh"),
      area("stale"),
      area("half", { isComplete: false, sizeBytes: 3_355_443 }),
      area("broken", { isComplete: false, sizeBytes: null })
    ])
    mockLoadOfflineAreaBounds.mockResolvedValue([
      entry("fresh"),
      entry("stale", { styleUrl: "https://tiles.example/old.json" })
    ])
    const api = await renderReady()

    expect(api.getByText("2.0 MB")).toBeTruthy()
    expect(api.getByTestId("area-fresh").props.accessibilityValue.text).toBe("")
    expect(api.getByText("Map style changed · 2.0 MB")).toBeTruthy()
    expect(api.getByTestId("area-stale").props.accessibilityValue.text).toBe(lightColors.warning)
    expect(api.getByText("Incomplete · 3.2 MB")).toBeTruthy()
    expect(api.getByText("Could not read this area")).toBeTruthy()
    for (const name of ["fresh", "stale", "half", "broken"]) {
      expect(api.getByTestId(`refresh-btn-${name}`)).toBeTruthy()
      expect(api.getByTestId(`delete-btn-${name}`)).toBeTruthy()
    }
  })

  it("fits the map to a row's own extent on tap", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("home")])
    const api = await renderReady()

    await press(api, "area-home-press")

    const [top, right, bottom, left] = GEOFENCE_ZOOM_PADDING
    expect(mockFitBounds).toHaveBeenCalledWith(BOUNDS, {
      padding: { top, right, bottom, left },
      duration: MAP_ANIMATION_DURATION_MS
    })
  })

  // Orphans go in one write so a second reader never sees a half-pruned list.
  it("prunes orphaned sidecar entries in one call, and not at all when there are none", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("home")])
    mockLoadOfflineAreaBounds.mockResolvedValue([entry("home"), entry("gone-1"), entry("gone-2")])
    await renderReady()
    expect(mockPruneOfflineAreaBounds).toHaveBeenCalledTimes(1)
    expect([...mockPruneOfflineAreaBounds.mock.calls[0][0]]).toEqual(["home"])

    jest.clearAllMocks()
    mockLoadOfflineAreas.mockResolvedValue([area("home")])
    mockLoadOfflineAreaBounds.mockResolvedValue([entry("home")])
    mockGetMostRecentLocation.mockResolvedValue(null)
    mockGetSetting.mockResolvedValue("")
    mockGetBounds.mockResolvedValue(BOUNDS)
    await renderReady()
    expect(mockPruneOfflineAreaBounds).not.toHaveBeenCalled()
  })

  it("shows no empty state before the first read lands, and none during a first download", async () => {
    mockLoadOfflineAreas.mockReturnValue(new Promise(() => {}))
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("map-ready")).toBeTruthy())
    expect(api.queryByText("No saved areas yet")).toBeNull()

    mockLoadOfflineAreas.mockResolvedValue([])
    const api2 = await renderReady("first")
    expect(api2.getByText("No saved areas yet")).toBeTruthy()
    await press(api2, "download-btn")
    expect(api2.queryByText("No saved areas yet")).toBeNull()
  })
})

describe("deleting", () => {
  it("names the bytes, and the cache reset only on the last area", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("home"), area("work")])
    const api = await renderReady()

    await press(api, "delete-btn-home")

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete "home"?',
        message: "Removes 2.0 MB of map tiles from this device.",
        destructive: true
      })
    )
    expect(mockDeleteOfflineArea).toHaveBeenCalledWith("home")
    expect(mockRemoveOfflineAreaBounds).toHaveBeenCalledWith("home")
    expect(mockDeleteOfflineArea.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemoveOfflineAreaBounds.mock.invocationCallOrder[0]
    )
  })

  it("adds the cache sentence when the last area goes", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("home")])
    const api = await renderReady()

    await press(api, "delete-btn-home")

    expect(mockShowConfirm.mock.calls[0][0].message).toContain("the map's online tile cache is cleared too")
  })

  it("deletes nothing when the confirmation is dismissed, and alerts on a failure", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("home")])
    mockShowConfirm.mockResolvedValueOnce(false)
    const api = await renderReady()

    await press(api, "delete-btn-home")
    expect(mockDeleteOfflineArea).not.toHaveBeenCalled()

    mockDeleteOfflineArea.mockRejectedValueOnce(new Error("locked"))
    await press(api, "delete-btn-home")
    expect(mockShowAlert).toHaveBeenCalledWith("Could not delete the area", expect.any(String), "error")
  })
})

describe("downloading again", () => {
  it("confirms, deletes the old tiles, then creates from the pack's own extent", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("home")])
    const api = await renderReady()

    await press(api, "refresh-btn-home")

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Download "home" again?', confirmText: "Download again" })
    )
    expect(mockDeleteOfflineArea).toHaveBeenCalledWith("home")
    expect(mockCreateOfflinePack).toHaveBeenCalledWith(
      "home",
      [13.5, 52.6],
      [13.4, 52.5],
      expect.any(Function),
      expect.any(Function)
    )
    expect(mockDeleteOfflineArea.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateOfflinePack.mock.invocationCallOrder[0]
    )
  })

  it("alerts and never creates when the old tiles cannot be removed", async () => {
    mockLoadOfflineAreas.mockResolvedValue([area("home")])
    mockDeleteOfflineArea.mockRejectedValueOnce(new Error("locked"))
    const api = await renderReady()

    await press(api, "refresh-btn-home")

    expect(mockShowAlert).toHaveBeenCalledWith("Could not download again", expect.any(String), "error")
    expect(mockCreateOfflinePack).not.toHaveBeenCalled()
  })
})
