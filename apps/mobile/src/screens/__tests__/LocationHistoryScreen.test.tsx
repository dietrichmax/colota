import React from "react"
import { render, fireEvent } from "@testing-library/react-native"

// --- Mocks ---

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getDaysWithData: jest.fn().mockResolvedValue([]),
    getLocationsByDateRange: jest.fn().mockResolvedValue([]),
    writeFile: jest.fn(),
    shareFile: jest.fn()
  }
}))

jest.mock("../../utils/trips", () => ({
  segmentTrips: jest.fn().mockReturnValue([])
}))

jest.mock("../../utils/geo", () => ({
  formatDistance: jest.fn().mockReturnValue("0 km")
}))

jest.mock("../../utils/exportConverters", () => ({
  TRIP_CONVERTERS: {},
  EXPORT_FORMATS: {}
}))

jest.mock("../../services/modalService", () => ({
  showAlert: jest.fn()
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      success: "#22c55e",
      error: "#ef4444",
      card: "#fff",
      surface: "#fff",
      backgroundElevated: "#f9fafb",
      textOnPrimary: "#fff",
      borderRadius: 8
    }
  })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  const stub = (name: string) => (_props: any) => R.createElement(Text, null, name)
  return {
    BarChart2: stub("BarChart2")
  }
})

jest.mock("../../components", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children)
  }
})

jest.mock("../../components/features/inspector/CalendarPicker", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    CalendarPicker: (_props: any) => R.createElement(View, { testID: "CalendarPicker" })
  }
})

jest.mock("../../components/features/inspector/TrackMap", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    TrackMap: (_props: any) => R.createElement(View, { testID: "TrackMap" })
  }
})

jest.mock("../../components/features/inspector/TripList", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    TripList: (_props: any) => R.createElement(View, { testID: "TripList" })
  }
})

jest.mock("../../components/features/inspector/LocationTable", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    LocationTable: (_props: any) => R.createElement(View, { testID: "LocationTable" })
  }
})

jest.mock("../../styles/typography", () => ({
  fonts: { regular: {}, bold: {}, semiBold: {} }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

import { LocationHistoryScreen } from "../LocationInspectorScreen"

const createProps = () => ({
  navigation: {
    navigate: jest.fn(),
    setOptions: jest.fn()
  },
  route: {
    params: {}
  }
})

describe("LocationHistoryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders all three tabs (Map, Trips, Data)", () => {
    const props = createProps()
    const { getByText } = render(<LocationHistoryScreen {...props} />)

    expect(getByText("Map")).toBeTruthy()
    expect(getByText("Trips")).toBeTruthy()
    expect(getByText("Data")).toBeTruthy()
  })

  it("Map tab is active by default", () => {
    const props = createProps()
    const { getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)

    // Map tab shows TrackMap
    expect(getByTestId("TrackMap")).toBeTruthy()
    // Trips and Data content should not be visible
    expect(queryByTestId("TripList")).toBeNull()
    expect(queryByTestId("LocationTable")).toBeNull()
  })

  it("switches to Trips tab on press", () => {
    const props = createProps()
    const { getByText, getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)

    fireEvent.press(getByText("Trips"))

    expect(getByTestId("TripList")).toBeTruthy()
    expect(queryByTestId("TrackMap")).toBeNull()
    expect(queryByTestId("LocationTable")).toBeNull()
  })

  it("switches to Data tab on press", () => {
    const props = createProps()
    const { getByText, getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)

    fireEvent.press(getByText("Data"))

    expect(getByTestId("LocationTable")).toBeTruthy()
    expect(queryByTestId("TrackMap")).toBeNull()
    expect(queryByTestId("TripList")).toBeNull()
  })

  it("renders CalendarPicker in each tab", () => {
    const props = createProps()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...props} />)

    // Map tab (default) - should have CalendarPicker
    expect(getByTestId("CalendarPicker")).toBeTruthy()

    // Switch to Trips tab
    fireEvent.press(getByText("Trips"))
    expect(getByTestId("CalendarPicker")).toBeTruthy()

    // Switch to Data tab
    fireEvent.press(getByText("Data"))
    expect(getByTestId("CalendarPicker")).toBeTruthy()
  })

  it("shows LocationTable in Data tab", () => {
    const props = createProps()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...props} />)

    // Initially not visible
    expect(() => getByTestId("LocationTable")).toThrow()

    // Switch to Data tab
    fireEvent.press(getByText("Data"))

    expect(getByTestId("LocationTable")).toBeTruthy()
  })
})
