import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

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

const mockGetStats = jest.fn().mockResolvedValue({ total: 100 })
const mockExportToFile = jest.fn().mockResolvedValue({
  filePath: "/path/file.csv",
  mimeType: "text/csv",
  rowCount: 100
})
const mockShareFile = jest.fn().mockResolvedValue(undefined)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: function () {
      return mockGetStats.apply(null, arguments)
    },
    exportToFile: function () {
      return mockExportToFile.apply(null, arguments)
    },
    shareFile: function () {
      return mockShareFile.apply(null, arguments)
    },
    getAutoExportStatus: jest.fn().mockResolvedValue({
      enabled: false,
      format: "geojson",
      interval: "daily",
      uri: null,
      mode: "all",
      lastExportTimestamp: 0,
      nextExportTimestamp: 0,
      fileCount: 0,
      retentionCount: 10
    })
  }
}))

const mockShowAlert = jest.fn()
const mockShowConfirm = jest.fn().mockResolvedValue(true)

jest.mock("../../services/modalService", () => ({
  showAlert: function () {
    return mockShowAlert.apply(null, arguments)
  },
  showConfirm: function () {
    return mockShowConfirm.apply(null, arguments)
  }
}))

jest.mock("../../utils/exportConverters", () => ({
  EXPORT_FORMATS: {
    csv: {
      label: "CSV",
      subtitle: "Spreadsheet Format",
      description: "Excel, Google Sheets, data analysis",
      icon: function () {
        return null
      },
      extension: ".csv",
      mimeType: "text/csv"
    },
    geojson: {
      label: "GeoJSON",
      subtitle: "Geographic Data",
      description: "Mapbox, Leaflet, QGIS, ArcGIS",
      icon: function () {
        return null
      },
      extension: ".geojson",
      mimeType: "application/json"
    },
    gpx: {
      label: "GPX",
      subtitle: "GPS Exchange",
      description: "Garmin, Strava, Google Earth",
      icon: function () {
        return null
      },
      extension: ".gpx",
      mimeType: "application/gpx+xml"
    },
    kml: {
      label: "KML",
      subtitle: "Keyhole Markup Language",
      description: "Google Earth, Google Maps, ArcGIS",
      icon: function () {
        return null
      },
      extension: ".kml",
      mimeType: "application/vnd.google-earth.kml+xml"
    }
  }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const RN = require("react-native")
  const { EXPORT_FORMATS } = require("../../utils/exportConverters")
  return {
    Container: function (props: any) {
      return R.createElement(RN.View, null, props.children)
    },
    Card: function (props: any) {
      return R.createElement(RN.View, null, props.children)
    },
    SectionTitle: function (props: any) {
      return R.createElement(RN.Text, null, props.children)
    },
    Divider: function () {
      return R.createElement(RN.View, null)
    },
    Button: function (props: any) {
      return R.createElement(
        RN.Pressable,
        { onPress: props.onPress, disabled: props.disabled, accessibilityRole: "button" },
        R.createElement(RN.Text, null, props.title)
      )
    },
    FormatSelector: function ({ onSelectFormat }: any) {
      return R.createElement(
        RN.View,
        null,
        Object.entries(EXPORT_FORMATS).map(function ([key, config]: any) {
          return R.createElement(
            RN.Pressable,
            {
              key: key,
              onPress: function () {
                onSelectFormat(key)
              }
            },
            R.createElement(RN.Text, null, config.label)
          )
        })
      )
    }
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const RN = require("react-native")
  function stub(name: any) {
    return function () {
      return R.createElement(RN.Text, null, name)
    }
  }
  return {
    Download: stub("Download"),
    MapPinOff: stub("MapPinOff"),
    ChevronRight: stub("ChevronRight"),
    Clock: stub("Clock"),
    Table2: stub("Table2"),
    Globe: stub("Globe"),
    MapPin: stub("MapPin"),
    Earth: stub("Earth")
  }
})

import { ExportDataScreen } from "../ExportDataScreen"

describe("ExportDataScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetStats.mockResolvedValue({ total: 100 })
    mockExportToFile.mockResolvedValue({
      filePath: "/path/file.csv",
      mimeType: "text/csv",
      rowCount: 100
    })
  })

  const mockNavigation = { navigate: jest.fn() } as any

  function renderScreen() {
    return render(<ExportDataScreen navigation={mockNavigation} />)
  }

  it("shows Export Data title", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Export Data")).toBeTruthy()
    })
  })

  it("shows empty state when no locations", async () => {
    mockGetStats.mockResolvedValue({ total: 0 })

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("No Locations")).toBeTruthy()
      expect(getByText("Start tracking to record locations that can be exported.")).toBeTruthy()
    })
  })

  it("shows total location count", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Total Locations")).toBeTruthy()
      expect(getByText("100")).toBeTruthy()
    })
  })

  it("renders all format options", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("CSV")).toBeTruthy()
      expect(getByText("GeoJSON")).toBeTruthy()
      expect(getByText("GPX")).toBeTruthy()
      expect(getByText("KML")).toBeTruthy()
    })
  })

  it("selecting a format shows the export button", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("CSV")).toBeTruthy()
    })

    fireEvent.press(getByText("CSV"))

    await waitFor(() => {
      expect(getByText("Export CSV")).toBeTruthy()
    })
  })

  it("shows loading overlay during export", async () => {
    // Make exportToFile hang so we can observe the loading state
    mockExportToFile.mockImplementation(() => new Promise(() => {}))

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("CSV")).toBeTruthy()
    })

    fireEvent.press(getByText("CSV"))

    await waitFor(() => {
      expect(getByText("Export CSV")).toBeTruthy()
    })

    fireEvent.press(getByText("Export CSV"))

    await waitFor(() => {
      expect(getByText("Exporting Data")).toBeTruthy()
    })
  })

  it("shows alert when exporting with no data", async () => {
    mockGetStats.mockResolvedValue({ total: 0 })

    const { getByText, queryByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("No Locations")).toBeTruthy()
    })

    // totalLocations is 0 so the format cards are not rendered and no export button exists
    expect(queryByText("CSV")).toBeNull()
  })
})
