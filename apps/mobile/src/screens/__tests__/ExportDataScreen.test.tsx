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
const mockGetExportData = jest.fn().mockResolvedValue([
  { latitude: 52.52, longitude: 13.405, accuracy: 10, altitude: 34, speed: 1.2, battery: 85, timestamp: 1700000000 },
  { latitude: 48.8566, longitude: 2.3522, accuracy: 15, altitude: 40, speed: 0.5, battery: 72, timestamp: 1700003600 }
])
const mockWriteFile = jest.fn().mockResolvedValue("/path/file.csv")
const mockShareFile = jest.fn().mockResolvedValue(undefined)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: function () {
      return mockGetStats.apply(null, arguments)
    },
    getExportData: function () {
      return mockGetExportData.apply(null, arguments)
    },
    writeFile: function () {
      return mockWriteFile.apply(null, arguments)
    },
    shareFile: function () {
      return mockShareFile.apply(null, arguments)
    }
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
  LARGE_FILE_THRESHOLD: 10 * 1024 * 1024,
  formatBytes: function (bytes: any) {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  },
  getByteSize: function (content: any) {
    return content.length
  },
  EXPORT_FORMATS: {
    csv: {
      label: "CSV",
      subtitle: "Spreadsheet Format",
      description: "Excel, Google Sheets, data analysis",
      icon: function () {
        return null
      },
      extension: ".csv",
      mimeType: "text/csv",
      convert: function () {
        return "id,lat,lon\n1,52.52,13.405"
      }
    },
    geojson: {
      label: "GeoJSON",
      subtitle: "Geographic Data",
      description: "Mapbox, Leaflet, QGIS, ArcGIS",
      icon: function () {
        return null
      },
      extension: ".geojson",
      mimeType: "application/json",
      convert: function () {
        return '{"type":"FeatureCollection","features":[]}'
      }
    },
    gpx: {
      label: "GPX",
      subtitle: "GPS Exchange",
      description: "Garmin, Strava, Google Earth",
      icon: function () {
        return null
      },
      extension: ".gpx",
      mimeType: "application/gpx+xml",
      convert: function () {
        return "<gpx></gpx>"
      }
    },
    kml: {
      label: "KML",
      subtitle: "Keyhole Markup Language",
      description: "Google Earth, Google Maps, ArcGIS",
      icon: function () {
        return null
      },
      extension: ".kml",
      mimeType: "application/vnd.google-earth.kml+xml",
      convert: function () {
        return "<kml></kml>"
      }
    }
  }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const RN = require("react-native")
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
    mockGetExportData.mockResolvedValue([
      {
        latitude: 52.52,
        longitude: 13.405,
        accuracy: 10,
        altitude: 34,
        speed: 1.2,
        battery: 85,
        timestamp: 1700000000
      },
      {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 15,
        altitude: 40,
        speed: 0.5,
        battery: 72,
        timestamp: 1700003600
      }
    ])
  })

  function renderScreen() {
    return render(<ExportDataScreen />)
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
      expect(getByText("Total")).toBeTruthy()
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
    // Make writeFile hang so we can observe the loading state
    mockWriteFile.mockImplementation(() => new Promise(() => {}))

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
