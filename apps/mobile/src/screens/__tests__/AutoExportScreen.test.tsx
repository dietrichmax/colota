import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter } from "react-native"

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      card: "#fff",
      border: "#e5e7eb",
      background: "#fff",
      backgroundElevated: "#f9fafb",
      success: "#22c55e",
      warning: "#f59e0b",
      info: "#3b82f6",
      error: "#ef4444",
      placeholder: "#9ca3af",
      textOnPrimary: "#fff",
      overlay: "rgba(0,0,0,0.5)"
    }
  })
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((cb) => cb())
}))

const mockGetAutoExportStatus = jest.fn().mockResolvedValue({
  enabled: false,
  format: "geojson",
  interval: "daily",
  uri: null,
  mode: "all",
  lastExportTimestamp: 0,
  nextExportTimestamp: 0,
  fileCount: 0,
  retentionCount: 10,
  lastFileName: null,
  lastRowCount: 0,
  lastError: null
})
const mockSaveSetting = jest.fn().mockResolvedValue(undefined)
const mockScheduleAutoExport = jest.fn().mockResolvedValue(true)
const mockCancelAutoExport = jest.fn().mockResolvedValue(true)
const mockPickExportDirectory = jest.fn().mockResolvedValue(null)
const mockRunAutoExportNow = jest.fn().mockResolvedValue(true)
const mockGetSetting = jest.fn().mockResolvedValue(null)
const mockGetExportFiles = jest.fn().mockResolvedValue([])
const mockShareExportFile = jest.fn().mockResolvedValue(true)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getAutoExportStatus: function () {
      return mockGetAutoExportStatus.apply(null, arguments)
    },
    saveSetting: function () {
      return mockSaveSetting.apply(null, arguments)
    },
    getSetting: function () {
      return mockGetSetting.apply(null, arguments)
    },
    scheduleAutoExport: function () {
      return mockScheduleAutoExport.apply(null, arguments)
    },
    cancelAutoExport: function () {
      return mockCancelAutoExport.apply(null, arguments)
    },
    pickExportDirectory: function () {
      return mockPickExportDirectory.apply(null, arguments)
    },
    runAutoExportNow: function () {
      return mockRunAutoExportNow.apply(null, arguments)
    },
    getExportFiles: function () {
      return mockGetExportFiles.apply(null, arguments)
    },
    shareExportFile: function () {
      return mockShareExportFile.apply(null, arguments)
    }
  }
}))

const mockShowAlert = jest.fn()

jest.mock("../../services/modalService", () => ({
  showAlert: function () {
    return mockShowAlert.apply(null, arguments)
  }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() }
}))

jest.mock("../../utils/exportConverters", () => {
  const R = require("react")
  const { View } = require("react-native")
  const icon = () => R.createElement(View, null)
  return {
    EXPORT_FORMAT_KEYS: ["csv", "geojson", "gpx", "kml"],
    EXPORT_FORMATS: {
      csv: { label: "CSV", extension: ".csv", subtitle: "Spreadsheet", description: "desc", icon },
      geojson: { label: "GeoJSON", extension: ".geojson", subtitle: "Geographic", description: "desc", icon },
      gpx: { label: "GPX", extension: ".gpx", subtitle: "GPS Exchange", description: "desc", icon },
      kml: { label: "KML", extension: ".kml", subtitle: "Keyhole", description: "desc", icon }
    }
  }
})

jest.mock("../../components", () => {
  const R = require("react")
  const RN = require("react-native")
  const { EXPORT_FORMATS, EXPORT_FORMAT_KEYS } = require("../../utils/exportConverters")
  return {
    Container: (props: any) => R.createElement(RN.View, null, props.children),
    Card: (props: any) => R.createElement(RN.View, null, props.children),
    SectionTitle: (props: any) => R.createElement(RN.Text, null, props.children),
    Divider: () => R.createElement(RN.View, null),
    RadioDot: (props: any) => R.createElement(RN.View, { testID: props.selected ? "radio-selected" : "radio" }),
    ChipGroup: (props: any) =>
      R.createElement(
        RN.View,
        null,
        props.options.map((opt: any) =>
          R.createElement(
            RN.Pressable,
            { key: opt.value, onPress: () => props.onSelect(opt.value), testID: `chip-${opt.value}` },
            R.createElement(RN.Text, null, opt.label)
          )
        )
      ),
    FormatSelector: (props: any) =>
      R.createElement(
        RN.View,
        null,
        EXPORT_FORMAT_KEYS.map((key: any) =>
          R.createElement(
            RN.Pressable,
            { key, onPress: () => props.onSelectFormat(key), testID: `format-${key}` },
            R.createElement(RN.Text, null, EXPORT_FORMATS[key].label),
            R.createElement(RN.Text, null, EXPORT_FORMATS[key].extension)
          )
        )
      ),
    FloatingSaveIndicator: () => null,
    SettingRow: (props: any) =>
      R.createElement(
        RN.View,
        null,
        R.createElement(RN.Text, null, props.label),
        props.hint && R.createElement(RN.Text, null, props.hint),
        props.children
      ),
    Button: (props: any) =>
      R.createElement(
        RN.Pressable,
        { onPress: props.onPress, disabled: props.disabled },
        R.createElement(RN.Text, null, props.title)
      )
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const RN = require("react-native")
  const stub = (name: any) => () => R.createElement(RN.Text, null, name)
  return {
    FolderOpen: stub("FolderOpen"),
    CheckCircle: stub("CheckCircle"),
    Share2: stub("Share2"),
    AlertTriangle: stub("AlertTriangle")
  }
})

import { AutoExportScreen } from "../AutoExportScreen"

describe("AutoExportScreen", () => {
  const mockProps = { navigation: { navigate: jest.fn() } } as any

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: false,
      format: "geojson",
      interval: "daily",
      uri: null,
      mode: "all",
      lastExportTimestamp: 0,
      nextExportTimestamp: 0,
      fileCount: 0,
      retentionCount: 10,
      lastFileName: null,
      lastRowCount: 0,
      lastError: null
    })
    mockGetExportFiles.mockResolvedValue([])
  })

  it("renders title and subtitle", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Auto-Export")).toBeTruthy()
      expect(getByText("Automatically export your location data on a schedule")).toBeTruthy()
    })
  })

  it("renders all format options", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("CSV")).toBeTruthy()
      expect(getByText("GeoJSON")).toBeTruthy()
      expect(getByText("GPX")).toBeTruthy()
      expect(getByText("KML")).toBeTruthy()
    })
  })

  it("renders all interval options including monthly", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Daily")).toBeTruthy()
      expect(getByText("Weekly")).toBeTruthy()
      expect(getByText("Monthly")).toBeTruthy()
    })
  })

  it("renders export mode options", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("All data")).toBeTruthy()
      expect(getByText("Since last export")).toBeTruthy()
    })
  })

  it("shows 'Never' when no export has occurred", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Never")).toBeTruthy()
    })
  })

  it("shows last export date when available", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: true,
      format: "csv",
      interval: "weekly",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 1700000000,
      nextExportTimestamp: 1700604800,
      fileCount: 5
    })

    const { queryByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(queryByText("Never")).toBeNull()
    })
  })

  it("shows alert when enabling without directory", async () => {
    const { getByRole } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByRole("switch")).toBeTruthy()
    })

    fireEvent(getByRole("switch"), "valueChange", true)

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("No Directory", "Please select an export directory first.", "info")
    })
  })

  it("enables auto-export when directory is set", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: false,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 0,
      nextExportTimestamp: 0,
      fileCount: 0
    })

    const { getByRole } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByRole("switch")).toBeTruthy()
    })

    fireEvent(getByRole("switch"), "valueChange", true)

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("autoExportEnabled", "true")
      expect(mockScheduleAutoExport).toHaveBeenCalled()
    })
  })

  it("disabling auto-export cancels the schedule", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: true,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 0,
      nextExportTimestamp: 86400,
      fileCount: 0
    })

    const { getByRole } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByRole("switch")).toBeTruthy()
    })

    fireEvent(getByRole("switch"), "valueChange", false)

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("autoExportEnabled", "false")
      expect(mockCancelAutoExport).toHaveBeenCalled()
    })
  })

  it("selecting directory picker calls native module", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Select Directory")).toBeTruthy()
    })

    fireEvent.press(getByText("Select Directory"))

    await waitFor(() => {
      expect(mockPickExportDirectory).toHaveBeenCalled()
    })
  })

  it("changing format saves the setting", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("CSV")).toBeTruthy()
    })

    fireEvent.press(getByText("CSV"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("autoExportFormat", "csv")
    })
  })

  it("changing interval saves the setting", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: true,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 0,
      nextExportTimestamp: 86400,
      fileCount: 0
    })

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Weekly")).toBeTruthy()
    })

    fireEvent.press(getByText("Weekly"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("autoExportInterval", "weekly")
    })
  })

  it("shows next export when enabled with last export", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: true,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 1700000000,
      nextExportTimestamp: 1700086400,
      fileCount: 3
    })

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Next Export")).toBeTruthy()
      expect(getByText("Export Files")).toBeTruthy()
      expect(getByText("3")).toBeTruthy()
    })
  })

  it("hides next export when disabled", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: false,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 1700000000,
      nextExportTimestamp: 0,
      fileCount: 3
    })

    const { queryByText, getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(queryByText("Next Export")).toBeNull()
      expect(getByText("Export Files")).toBeTruthy()
    })
  })

  it("changing mode saves the setting", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Since last export")).toBeTruthy()
    })

    fireEvent.press(getByText("Since last export"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("autoExportMode", "incremental")
    })
  })

  it("changing retention saves the setting", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("5 files")).toBeTruthy()
    })

    fireEvent.press(getByText("5 files"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("autoExportRetentionCount", "5")
    })
  })

  it("shows Export Now button when directory is set", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: false,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 0,
      nextExportTimestamp: 0,
      fileCount: 0
    })

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Export Now")).toBeTruthy()
    })
  })

  it("hides Export Now button when no directory is set", async () => {
    const { queryByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(queryByText("Export Now")).toBeNull()
    })
  })

  it("Export Now triggers runAutoExportNow", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: false,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 0,
      nextExportTimestamp: 0,
      fileCount: 0
    })

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Export Now")).toBeTruthy()
    })

    fireEvent.press(getByText("Export Now"))

    await waitFor(() => {
      expect(mockRunAutoExportNow).toHaveBeenCalled()
      expect(mockShowAlert).toHaveBeenCalledWith(
        "Export Started",
        "Export is running in the background. The status will update when complete.",
        "info"
      )
    })
  })

  it("shows permission lost alert when flag is set", async () => {
    mockGetSetting.mockResolvedValue("true")

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Auto-Export")).toBeTruthy()
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        "Export Directory Access Lost",
        "The app lost access to the export directory. Please re-select it to resume auto-exports.",
        "warning"
      )
      expect(mockSaveSetting).toHaveBeenCalledWith("autoExportPermissionLost", "false")
    })
  })

  it("shows last file name and row count in status", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: true,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 1700000000,
      nextExportTimestamp: 1700086400,
      fileCount: 3,
      retentionCount: 10,
      lastFileName: "colota_export_2026-03-10_1200.geojson",
      lastRowCount: 42,
      lastError: null
    })

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Last File")).toBeTruthy()
      expect(getByText("colota_export_2026-03-10_1200.geojson")).toBeTruthy()
      expect(getByText("Locations Exported")).toBeTruthy()
      expect(getByText("42")).toBeTruthy()
    })
  })

  it("shows error message when lastError is set", async () => {
    mockGetAutoExportStatus.mockResolvedValue({
      enabled: true,
      format: "geojson",
      interval: "daily",
      uri: "content://some-uri",
      mode: "all",
      lastExportTimestamp: 1700000000,
      nextExportTimestamp: 1700086400,
      fileCount: 0,
      retentionCount: 10,
      lastFileName: null,
      lastRowCount: 0,
      lastError: "IO error: disk full"
    })

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("IO error: disk full")).toBeTruthy()
    })
  })

  it("renders export history with file list", async () => {
    mockGetExportFiles.mockResolvedValue([
      { name: "colota_export_2026-03-10.geojson", size: 1024, lastModified: 1700000000, uri: "content://file1" },
      { name: "colota_export_2026-03-09.geojson", size: 2048, lastModified: 1699913600, uri: "content://file2" }
    ])

    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Export History")).toBeTruthy()
      expect(getByText("colota_export_2026-03-10.geojson")).toBeTruthy()
      expect(getByText("colota_export_2026-03-09.geojson")).toBeTruthy()
    })
  })

  it("does not show export history when no files", async () => {
    mockGetExportFiles.mockResolvedValue([])

    const { queryByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(queryByText("Export History")).toBeNull()
    })
  })

  it("handles onAutoExportComplete event for success", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Auto-Export")).toBeTruthy()
    })

    await act(async () => {
      DeviceEventEmitter.emit("onAutoExportComplete", {
        success: true,
        fileName: "colota_export_2026-03-10.csv",
        rowCount: 100,
        error: null
      })
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith(
        "Export Complete",
        "Exported 100 locations to colota_export_2026-03-10.csv",
        "success"
      )
    })
  })

  it("handles onAutoExportComplete event for failure", async () => {
    const { getByText } = render(<AutoExportScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Auto-Export")).toBeTruthy()
    })

    await act(async () => {
      DeviceEventEmitter.emit("onAutoExportComplete", {
        success: false,
        fileName: null,
        rowCount: 0,
        error: "Directory permission lost"
      })
    })

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Export Failed", "Directory permission lost", "error")
    })
  })
})
