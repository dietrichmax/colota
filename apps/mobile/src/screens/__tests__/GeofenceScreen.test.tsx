import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter, Share } from "react-native"
import { Geofence } from "../../types/global"
import { GEOFENCE_ZOOM_PADDING, size, space } from "../../constants"

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react")
    R.useEffect(() => {
      const cleanup = cb()
      return typeof cleanup === "function" ? cleanup : undefined
    }, [cb])
  }
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors, mode: "light" })
}))

let mockTracking = true
let mockCoords: { latitude: number; longitude: number; accuracy: number } | null = null
jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({ tracking: mockTracking }),
  useCoords: () => mockCoords
}))

const mockGetGeofences = jest.fn()
const mockCheckCurrentPauseZone = jest.fn()
const mockGetMostRecentLocation = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getGeofences: (...args: any[]) => mockGetGeofences(...args),
    checkCurrentPauseZone: (...args: any[]) => mockCheckCurrentPauseZone(...args),
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args)
  }
}))

const mockShowAlert = jest.fn()
jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args)
}))

const mockFitBounds = jest.fn()
const mockFlyTo = jest.fn()
const mockMapProps = jest.fn()
jest.mock("../../components/features/map/ColotaMapView", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    ColotaMapView: R.forwardRef((props: any, ref: any) => {
      R.useImperativeHandle(ref, () => ({ camera: { fitBounds: mockFitBounds, flyTo: mockFlyTo }, mapView: null }))
      mockMapProps(props)
      return R.createElement(
        View,
        { testID: "colota-map" },
        R.createElement(Pressable, { testID: "map-ready", onPress: () => props.onMapReady?.() }),
        R.createElement(Pressable, {
          testID: "map-pan",
          onPress: () => props.onRegionDidChange?.({ isUserInteraction: true })
        }),
        props.children
      )
    })
  }
})

jest.mock("../../components/features/map/GeofenceLayers", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    GeofenceLayers: (props: any) =>
      R.createElement(
        View,
        { testID: "geofence-layers", ...props },
        props.onPressZone && R.createElement(Pressable, { testID: "tap-zone-2", onPress: () => props.onPressZone(2) })
      )
  }
})

jest.mock("../../components/features/map/UserLocationOverlay", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { UserLocationOverlay: (props: any) => R.createElement(View, { testID: "user-location-overlay", ...props }) }
})

jest.mock("../../components/features/map/MapActionButton", () => {
  const R = require("react")
  const { Pressable } = require("react-native")
  return {
    MapActionButton: (props: any) =>
      R.createElement(Pressable, {
        testID: props.testID,
        accessibilityRole: "button",
        accessibilityLabel: props.accessibilityLabel,
        onPress: props.onPress,
        style: props.style
      })
  }
})

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, { testID: "zone-card" }, children),
    Divider: () => null,
    EmptyState: ({ title, hint, action }: any) =>
      R.createElement(
        View,
        { testID: "EmptyState" },
        R.createElement(Text, null, title),
        R.createElement(Text, null, hint),
        action &&
          R.createElement(
            Pressable,
            { testID: "empty-action", onPress: action.onPress },
            R.createElement(Text, null, action.label)
          )
      ),
    ListItem: ({ label, sub, onPress, testID, icon }: any) =>
      R.createElement(
        Pressable,
        { accessibilityRole: "button", onPress, testID, accessibilityLabel: `${label}, ${sub}` },
        R.createElement(Text, null, label),
        R.createElement(Text, null, sub),
        R.createElement(Text, { testID: `${testID}-glyph` }, icon?.displayName ?? icon?.name ?? "icon")
      )
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  formatShortDistance: (m: number) => `${m}m`
}))

import { GeofenceScreen } from "../GeofenceScreen"

const zone = (id: number, name: string, overrides: Partial<Geofence> = {}): Geofence => ({
  id,
  name,
  lat: 48.1 + id * 0.01,
  lon: 11.5,
  radius: 100 * id,
  enabled: true,
  pauseTracking: true,
  pauseOnWifi: id === 1,
  pauseOnMotionless: false,
  motionlessTimeoutMinutes: 5,
  heartbeatEnabled: false,
  heartbeatIntervalMinutes: 15,
  ...overrides
})
const zones = [zone(1, "Home"), zone(2, "Office", { pauseTracking: false })]

const lastOptions = (props: any) => props.navigation.setOptions.mock.calls.at(-1)[0]
const headerRight = (props: any) => render(lastOptions(props).headerRight())

function createProps() {
  return { navigation: { navigate: jest.fn(), setOptions: jest.fn() } } as any
}

async function renderReady(props = createProps()) {
  const utils = render(<GeofenceScreen {...props} />)
  await waitFor(() => expect(utils.getByTestId("colota-map")).toBeTruthy())
  fireEvent.press(utils.getByTestId("map-ready"))
  await act(async () => {})
  return { ...utils, props }
}

describe("GeofenceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTracking = true
    mockCoords = null
    mockGetGeofences.mockResolvedValue(zones)
    mockCheckCurrentPauseZone.mockResolvedValue(null)
    mockGetMostRecentLocation.mockResolvedValue({ latitude: 48.1, longitude: 11.5, accuracy: 8 })
  })

  it("lists every geofence as a row that says what it does, with no header counting them", async () => {
    const { getByText, queryByText, getByTestId } = await renderReady()

    expect(getByTestId("zone-card")).toBeTruthy()
    expect(getByText("Home")).toBeTruthy()
    expect(getByText("100m · WiFi pause")).toBeTruthy()
    expect(getByText("200m · recording continues")).toBeTruthy()
    expect(queryByText(/Active geofences/)).toBeNull()
    expect(queryByText("Create geofence")).toBeNull()
  })

  it("opens the editor from a row, from a circle on the map and from the header Create", async () => {
    const { getByTestId, props } = await renderReady()

    fireEvent.press(getByTestId("edit-geofence-1"))
    expect(props.navigation.navigate).toHaveBeenCalledWith("Geofence Editor", { geofenceId: 1 })

    fireEvent.press(getByTestId("tap-zone-2"))
    expect(props.navigation.navigate).toHaveBeenLastCalledWith("Geofence Editor", { geofenceId: 2 })

    fireEvent.press(headerRight(props).getByLabelText("Create geofence"))
    expect(props.navigation.navigate).toHaveBeenLastCalledWith("Geofence Editor", {})
  })

  it("shares every geofence from the header, only once there is one to share", async () => {
    const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined })
    const { props } = await renderReady()

    const bar = headerRight(props)
    fireEvent.press(bar.getByLabelText("Share all geofences"))
    await waitFor(() => expect(shareSpy).toHaveBeenCalledWith({ message: expect.stringContaining("colota://setup") }))

    mockGetGeofences.mockResolvedValue([])
    const emptyProps = createProps()
    await renderReady(emptyProps)
    expect(headerRight(emptyProps).queryByLabelText("Share all geofences")).toBeNull()
    shareSpy.mockRestore()
  })

  it("says so when the share sheet fails", async () => {
    const shareSpy = jest.spyOn(Share, "share").mockRejectedValue(new Error("no sheet"))
    const { props } = await renderReady()

    fireEvent.press(headerRight(props).getByLabelText("Share all geofences"))

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to share geofences.", "error"))
    shareSpy.mockRestore()
  })

  it("marks the geofence you stand in with a check and the words Paused here, and clears it when you leave", async () => {
    mockCheckCurrentPauseZone.mockResolvedValue({ zoneName: "Home", pauseReason: "wifi" })
    const { getByText, queryByText, getByTestId } = await renderReady()

    await waitFor(() => expect(getByText("Paused here · 100m · WiFi pause")).toBeTruthy())
    expect(getByTestId("edit-geofence-1-glyph").props.children).toBe("MapPinCheck")
    expect(getByTestId("edit-geofence-2-glyph").props.children).toBe("MapPinHouse")

    act(() => {
      DeviceEventEmitter.emit("onPauseZoneChange", { entered: false, zoneName: null, pauseReason: null })
    })
    await waitFor(() => expect(queryByText(/Paused here/)).toBeNull())

    act(() => {
      DeviceEventEmitter.emit("onPauseZoneChange", { entered: true, zoneName: "Home", pauseReason: "wifi" })
    })
    await waitFor(() => expect(getByText(/^Paused here/)).toBeTruthy())
  })

  it("fits the camera to every geofence once the map is ready, inside the control column, and again only when the set changes", async () => {
    const { getByTestId } = await renderReady()

    expect(mockFitBounds).toHaveBeenCalledTimes(1)
    const [bounds, options] = mockFitBounds.mock.calls[0]
    expect(bounds[1]).toBeLessThan(48.11)
    expect(bounds[3]).toBeGreaterThan(48.12)
    expect(options.padding).toEqual({
      top: GEOFENCE_ZOOM_PADDING[0] + space.lg,
      right: GEOFENCE_ZOOM_PADDING[1] + space.lg + size.iconColumn + space.lg,
      bottom: GEOFENCE_ZOOM_PADDING[2] + space.lg,
      left: GEOFENCE_ZOOM_PADDING[3] + space.lg
    })
    expect(options.duration).toBe(0)

    act(() => {
      DeviceEventEmitter.emit("geofenceUpdated")
    })
    await act(async () => {})
    expect(mockFitBounds).toHaveBeenCalledTimes(1)

    mockGetGeofences.mockResolvedValue([...zones, zone(3, "Gym")])
    act(() => {
      DeviceEventEmitter.emit("geofenceUpdated")
    })
    await waitFor(() => expect(mockFitBounds).toHaveBeenCalledTimes(2))
    expect(mockFitBounds.mock.calls[1][1].duration).toBeGreaterThan(0)
    expect(getByTestId("colota-map")).toBeTruthy()
  })

  it("offers a fit disc only after a pan, and hides it again once pressed", async () => {
    const { getByTestId, queryByTestId, getByLabelText } = await renderReady()

    expect(queryByTestId("fit-geofences-btn")).toBeNull()
    fireEvent.press(getByTestId("map-pan"))
    const disc = getByLabelText("Fit geofences")
    expect(disc.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ bottom: space.lg + space.sm + size.iconColumn + space.lg })])
    )

    fireEvent.press(disc)
    expect(mockFitBounds).toHaveBeenCalledTimes(2)
    expect(queryByTestId("fit-geofences-btn")).toBeNull()
  })

  it("shows the empty tab under a map on the last fix, with one action, and the disc centres on the fix after a pan", async () => {
    mockGetGeofences.mockResolvedValue([])
    const { getByText, getByTestId, queryByTestId, getByLabelText, props } = await renderReady()

    expect(queryByTestId("zone-card")).toBeNull()
    expect(getByText("No geofences yet")).toBeTruthy()
    expect(mockMapProps.mock.calls[0][0].initialCenter).toEqual([11.5, 48.1])
    fireEvent.press(getByTestId("empty-action"))
    expect(props.navigation.navigate).toHaveBeenCalledWith("Geofence Editor", {})

    fireEvent.press(getByTestId("map-pan"))
    fireEvent.press(getByLabelText("Centre map on my position"))
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [11.5, 48.1] }))
    expect(mockFitBounds).not.toHaveBeenCalled()
  })

  it("draws no tiles until the database has answered, so the map never opens on the world view and jumps", async () => {
    mockGetMostRecentLocation.mockReturnValue(new Promise(() => {}))
    const { queryByTestId } = render(<GeofenceScreen {...createProps()} />)
    await act(async () => {})

    expect(queryByTestId("colota-map")).toBeNull()
  })

  it("draws the live dot only while tracking, greyed inside the geofence you are paused in", async () => {
    mockCoords = { latitude: 48.1, longitude: 11.5, accuracy: 4 }
    mockCheckCurrentPauseZone.mockResolvedValue({ zoneName: "Home", pauseReason: null })
    const { getByTestId } = await renderReady()
    await waitFor(() => expect(getByTestId("user-location-overlay").props.isPaused).toBe(true))

    mockTracking = false
    const { queryByTestId } = await renderReady()
    expect(queryByTestId("user-location-overlay")).toBeNull()
  })
})
