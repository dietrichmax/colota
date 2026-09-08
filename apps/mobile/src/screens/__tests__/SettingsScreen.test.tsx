import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter, Linking } from "react-native"
import { lightColors } from "@colota/shared"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => require("react").useEffect(() => cb(), [])
}))

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = false
let mockActiveProfileName: string | null = null

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    tracking: mockTracking,
    activeProfileName: mockActiveProfileName
  })
}))

// The real getters fall back to the host locale, which decides the assertion otherwise.
jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  getUnitSystem: () => "metric",
  getTimeFormat: () => "24h"
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", preference: "dark", colors: require("@colota/shared").lightColors })
}))

const mockGetStats = jest.fn()
const mockGetProfiles = jest.fn()
const mockIsNetworkAvailable = jest.fn()
const mockGetAutoExportStatus = jest.fn()
const mockGetSetting = jest.fn()
const mockGetFileLogSize = jest.fn()
const mockLoadOfflineAreas = jest.fn()
let mockFlavor = "gms"

jest.mock("../../services/ProfileService", () => ({
  ProfileService: { getProfiles: (...args: unknown[]) => mockGetProfiles(...args) }
}))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
    isNetworkAvailable: (...args: unknown[]) => mockIsNetworkAvailable(...args),
    getAutoExportStatus: (...args: unknown[]) => mockGetAutoExportStatus(...args),
    getSetting: (...args: unknown[]) => mockGetSetting(...args),
    getFileLogSize: (...args: unknown[]) => mockGetFileLogSize(...args),
    getBuildConfig: () => ({ FLAVOR: mockFlavor, VERSION_NAME: "1.16.0" })
  }
}))

jest.mock("../../components/features/map/OfflinePackManager", () => ({
  loadOfflineAreas: (...args: unknown[]) => mockLoadOfflineAreas(...args)
}))

const mockShowAlert = jest.fn()
jest.mock("../../services/modalService", () => ({ showAlert: (...args: unknown[]) => mockShowAlert(...args) }))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    ListItem: ({
      testID,
      label,
      sub,
      onPress,
      icon,
      iconColor,
      subLines,
      trailingIcon,
      accessibilityRole,
      accessibilityHint
    }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          accessibilityRole: accessibilityRole ?? "button",
          accessibilityHint:
            accessibilityHint ?? (accessibilityRole === "link" ? `Opens ${label} in the browser` : `Opens ${label}`),
          accessibilityValue: {
            text: `${iconColor ?? "default"}|${subLines ?? 1}|${trailingIcon ? "link" : "chevron"}`
          }
        },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null,
        R.createElement(Text, { testID: `${testID}-glyph` }, icon?.displayName ?? "icon")
      )
  }
})

import { SettingsScreen } from "../SettingsScreen"

const mockNavigate = jest.fn()
const mockProps = { navigation: { navigate: mockNavigate }, route: { key: "Settings", name: "Settings" } } as any
const renderScreen = () => render(<SettingsScreen {...mockProps} />)
const meta = (api: ReturnType<typeof render>, testID: string) =>
  api.getByTestId(testID).props.accessibilityValue.text.split("|")

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetStats.mockResolvedValue({
      queued: 5,
      sent: 42,
      total: 12480,
      today: 10,
      databaseSizeMB: 3.4213,
      lastSyncTime: 0,
      lastSyncError: ""
    })
    mockGetProfiles.mockResolvedValue([])
    mockIsNetworkAvailable.mockResolvedValue(true)
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: false,
      interval: "weekly",
      format: "geojson",
      lastError: null
    })
    mockGetSetting.mockResolvedValue("false")
    mockGetFileLogSize.mockResolvedValue(0)
    mockLoadOfflineAreas.mockResolvedValue([])
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
    mockActiveProfileName = null
    mockFlavor = "gms"
  })

  describe("the shape", () => {
    it("is five groups, Help then About, with no banner and nothing above the list", async () => {
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      expect(api.getByText("Tracking")).toBeTruthy()
      expect(api.getByText("Display")).toBeTruthy()
      expect(api.getByText("Data")).toBeTruthy()
      expect(api.getByText("Help")).toBeTruthy()
      // The group and its terminal row are both "About", which is the Android convention.
      expect(api.getAllByText("About")).toHaveLength(2)
      expect(api.queryByText("Colota")).toBeNull()
      expect(api.queryByTestId("queue-warning")).toBeNull()
    })

    it("carries no Request format row, so no row appears or disappears with a setting", async () => {
      const online = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
      expect(online.queryByTestId("nav-api-config")).toBeNull()

      mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }
      const offline = renderScreen()
      await waitFor(() => expect(offline.queryByTestId("nav-api-config")).toBeNull())
      expect(offline.getByTestId("nav-connection")).toBeTruthy()
    })

    it("keeps each group's rows in the order the hub was designed around", async () => {
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      const ids: string[] = []
      const walk = (node: any) => {
        if (!node || typeof node !== "object") return
        if (Array.isArray(node)) return node.forEach(walk)
        const id = node.props?.testID
        if (typeof id === "string" && id.startsWith("nav-") && !id.endsWith("-glyph")) ids.push(id)
        ;(node.children ?? []).forEach(walk)
      }
      walk(api.toJSON())

      expect(ids).toEqual([
        "nav-connection",
        "nav-tracking-sync",
        "nav-tracking-profiles",
        "nav-appearance",
        "nav-offline-maps",
        "nav-data-management",
        "nav-import-locations",
        "nav-export-locations",
        "nav-auto-export",
        "nav-backup-restore",
        "nav-share-setup",
        "nav-logging",
        "nav-feedback",
        "nav-whats-new",
        "nav-rate",
        "nav-support",
        "nav-legal",
        "nav-about"
      ])
    })

    it("opens the destinations it names", async () => {
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      const routes: [string, string][] = [
        ["nav-connection", "Connection"],
        ["nav-tracking-sync", "Tracking & Sync"],
        ["nav-tracking-profiles", "Tracking Profiles"],
        ["nav-appearance", "Appearance"],
        ["nav-offline-maps", "Offline Maps"],
        ["nav-data-management", "Data Management"],
        ["nav-import-locations", "Import Locations"],
        ["nav-export-locations", "Export Locations"],
        ["nav-auto-export", "Auto-Export"],
        ["nav-backup-restore", "Backup & Restore"],
        ["nav-share-setup", "Share Setup"],
        ["nav-logging", "Logging"],
        ["nav-legal", "Legal"],
        ["nav-about", "About Colota"]
      ]
      for (const [testID, route] of routes) {
        fireEvent.press(api.getByTestId(testID))
        expect(mockNavigate).toHaveBeenCalledWith(route)
      }
    })
  })

  describe("the two state rows", () => {
    it("prints the server relationship and tints the glyph when it is wrong", async () => {
      mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track" }
      mockGetStats.mockResolvedValue({
        queued: 1240,
        sent: 0,
        total: 12480,
        today: 10,
        databaseSizeMB: 3.4,
        lastSyncTime: 0,
        lastSyncError: "HTTP 401 Unauthorized"
      })
      const api = renderScreen()

      expect(await api.findByText("api.example.com · 1,240 queued · sync failing")).toBeTruthy()
      expect(meta(api, "nav-connection")[0]).toBe(lightColors.error)
    })

    it("can say no network, which the hardcoded flag made unreachable", async () => {
      mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track" }
      mockIsNetworkAvailable.mockResolvedValue(false)
      const api = renderScreen()

      expect(await api.findByText(/no network$/)).toBeTruthy()
    })

    it("warns on a missing server and leaves an offline tracker untinted", async () => {
      const api = renderScreen()
      expect(await api.findByText("No server configured")).toBeTruthy()
      expect(meta(api, "nav-connection")[0]).toBe(lightColors.warning)

      mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }
      const offline = renderScreen()
      expect(await offline.findByText("Offline - saved locally · 10 today")).toBeTruthy()
      expect(meta(offline, "nav-connection")[0]).toBe("default")
    })

    it("names the rule in force and tints only then, in the Profiles screen's own words", async () => {
      mockGetProfiles.mockResolvedValue([{ id: 1 }])
      mockTracking = true
      mockActiveProfileName = "Charging"
      const api = renderScreen()

      expect(await api.findByText("Charging is active")).toBeTruthy()
      expect(meta(api, "nav-tracking-profiles")[0]).toBe(lightColors.success)
    })

    it("says no profile active while tracking runs without one, and no profiles yet at zero", async () => {
      mockGetProfiles.mockResolvedValue([{ id: 1 }])
      mockTracking = true
      const active = renderScreen()
      expect(await active.findByText("No profile active")).toBeTruthy()
      expect(meta(active, "nav-tracking-profiles")[0]).toBe("default")

      mockGetProfiles.mockResolvedValue([])
      const empty = renderScreen()
      expect(await empty.findByText("No profiles yet")).toBeTruthy()
    })

    it("gives Connection the room to wrap, since a self-hosted host is unbounded", async () => {
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      expect(meta(api, "nav-connection")[1]).toBe("2")
      expect(meta(api, "nav-tracking-sync")[1]).toBe("1")
    })
  })

  describe("the value subs", () => {
    it("prints the cadence, the appearance and the ledger's own numbers", async () => {
      const api = renderScreen()

      expect(await api.findByText("12,480 locations · 3.42 MB")).toBeTruthy()
      expect(api.getByText("Every 5 s, any movement · syncs each fix")).toBeTruthy()
      expect(api.getByText("Dark · Metric · 24h")).toBeTruthy()
    })

    it("prints the formats from the shared table, not a sentence about the screen", async () => {
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      expect(api.getByText("GeoJSON, GPX, KML, Google Timeline, CSV")).toBeTruthy()
      expect(api.getByText("GeoJSON, GPX, KML, CSV")).toBeTruthy()
      expect(api.queryByText(/Merge locations from/)).toBeNull()
      expect(api.queryByText("Encrypted backup of all your data")).toBeNull()
    })

    it("reads auto-export, logging and the offline packs on focus", async () => {
      mockGetAutoExportStatus.mockResolvedValue({
        enabled: true,
        interval: "weekly",
        format: "geojson",
        lastError: "Folder not writable"
      })
      mockGetSetting.mockResolvedValue("true")
      mockGetFileLogSize.mockResolvedValue(2516582)
      mockLoadOfflineAreas.mockResolvedValue([
        { name: "Munich", sizeBytes: 44040192, isComplete: true, isActive: false }
      ])
      const api = renderScreen()

      expect(await api.findByText("Weekly · GeoJSON · last export failed")).toBeTruthy()
      expect(api.getByText("File logging on · 2.4 MB")).toBeTruthy()
      expect(api.getByText("1 area · 42.0 MB")).toBeTruthy()
    })

    it("keeps every other sub when one read rejects, rather than blanking the card", async () => {
      // A resolved read whose value differs from the default, so a swallowed rejection would show.
      mockGetSetting.mockResolvedValue("true")
      mockGetFileLogSize.mockResolvedValue(2516582)
      mockLoadOfflineAreas.mockRejectedValue(new Error("MapLibre"))
      mockGetAutoExportStatus.mockRejectedValue(new Error("bridge"))
      const api = renderScreen()

      expect(await api.findByText("12,480 locations · 3.42 MB")).toBeTruthy()
      expect(api.getByText("File logging on · 2.4 MB")).toBeTruthy()
      expect(api.getByText("No saved areas")).toBeTruthy()
      expect(api.getByText("Off")).toBeTruthy()
    })

    it("issues every focus read at once, so a slow pack walk does not hold the others back", async () => {
      let releaseStats: (v: unknown) => void = () => {}
      mockGetStats.mockImplementationOnce(() => new Promise((r) => (releaseStats = r)))
      renderScreen()

      // The five slower reads must already be in flight while getStats is still pending.
      await waitFor(() => expect(mockLoadOfflineAreas).toHaveBeenCalled())
      expect(mockGetAutoExportStatus).toHaveBeenCalled()
      releaseStats({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0, lastSyncTime: 0, lastSyncError: "" })
    })

    it("re-reads only the two cheap values on a sync event, not the pack walk", async () => {
      const api = renderScreen()
      await api.findByText("12,480 locations · 3.42 MB")
      const packWalks = mockLoadOfflineAreas.mock.calls.length

      mockGetStats.mockResolvedValue({
        queued: 7,
        sent: 42,
        total: 12481,
        today: 11,
        databaseSizeMB: 3.4213,
        lastSyncTime: 0,
        lastSyncError: ""
      })
      act(() => {
        DeviceEventEmitter.emit("onLocationUpdate", {})
      })

      expect(await api.findByText("12,481 locations · 3.42 MB")).toBeTruthy()
      expect(mockLoadOfflineAreas.mock.calls.length).toBe(packWalks)
    })

    it("re-reads the export status when a scheduled run completes, so the row is not stale", async () => {
      const api = renderScreen()
      await api.findByText("Off")

      mockGetAutoExportStatus.mockResolvedValue({
        enabled: true,
        interval: "daily",
        format: "gpx",
        lastError: null
      })
      act(() => {
        DeviceEventEmitter.emit("onAutoExportComplete", {})
      })

      expect(await api.findByText("Daily · GPX")).toBeTruthy()
    })

    it("words the zero states rather than printing a zero", async () => {
      mockGetStats.mockResolvedValue({
        queued: 0,
        sent: 0,
        total: 0,
        today: 0,
        databaseSizeMB: 0.02,
        lastSyncTime: 0,
        lastSyncError: ""
      })
      const api = renderScreen()

      expect(await api.findByText("No locations recorded")).toBeTruthy()
      expect(api.getByText("No saved areas")).toBeTruthy()
      expect(api.getByText("File logging off")).toBeTruthy()
    })
  })

  describe("the rows that leave the app", () => {
    it("names the destination, marks itself a link and says so to a screen reader", async () => {
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      expect(api.getByText("github.com/dietrichmax/colota/issues")).toBeTruthy()
      expect(api.getByText("colota.app/releases")).toBeTruthy()
      expect(api.getByText("mxd.codes/support")).toBeTruthy()
      expect(meta(api, "nav-feedback")[2]).toBe("link")
      expect(api.getByTestId("nav-feedback").props.accessibilityHint).toBe("Opens Feedback & help in the browser")
      expect(api.getByTestId("nav-rate").props.accessibilityHint).toBe("Opens Colota in Google Play")
      expect(meta(api, "nav-legal")[2]).toBe("chevron")
    })

    it("opens the destination each link row names", async () => {
      const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      fireEvent.press(api.getByTestId("nav-feedback"))
      expect(spy).toHaveBeenLastCalledWith("https://github.com/dietrichmax/colota/issues")
      fireEvent.press(api.getByTestId("nav-whats-new"))
      expect(spy).toHaveBeenLastCalledWith("https://colota.app/releases")
      fireEvent.press(api.getByTestId("nav-support"))
      expect(spy).toHaveBeenLastCalledWith("https://mxd.codes/support")
      spy.mockRestore()
    })

    it("falls back to the Play website when the store app is not there, and reports a dead link", async () => {
      const spy = jest
        .spyOn(Linking, "openURL")
        .mockRejectedValueOnce(new Error("no activity"))
        .mockResolvedValue(undefined)
      const api = renderScreen()
      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())

      fireEvent.press(api.getByTestId("nav-rate"))
      await waitFor(() => expect(spy).toHaveBeenCalledWith("https://play.google.com/store/apps/details?id=com.Colota"))

      spy.mockRejectedValue(new Error("no browser"))
      fireEvent.press(api.getByTestId("nav-support"))
      await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith("Error", "Could not open the link.", "error"))
      spy.mockRestore()
    })

    it("hides Rate the app on the FOSS build, where a Play listing is a dead end", async () => {
      mockFlavor = "foss"
      const api = renderScreen()

      expect(await api.findByText("Version 1.16.0 · FOSS")).toBeTruthy()
      expect(api.queryByTestId("nav-rate")).toBeNull()
      expect(api.getByTestId("nav-support")).toBeTruthy()
    })

    it("prints the build on the About row in the words the About screen uses", async () => {
      const api = renderScreen()

      expect(await api.findByText("Version 1.16.0 · Google Play")).toBeTruthy()
    })
  })
})
