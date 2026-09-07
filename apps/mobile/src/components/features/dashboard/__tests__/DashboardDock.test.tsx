import React from "react"
import { render } from "@testing-library/react-native"
import { ScrollView, StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { DEFAULT_SETTINGS } from "../../../../types/global"
import { size } from "../../../../constants"
import { loadDisplayPreferences } from "../../../../utils/geo"
import { Card } from "../../../ui/Card"
import { Divider } from "../../../ui/Divider"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

const mockGetSetting = jest.fn()
jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getSetting: (...args: string[]) => mockGetSetting(...args)
  }
}))

jest.mock("../ConnectionStatus", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    ConnectionStatus: (props: any) => R.createElement(View, { testID: "ConnectionStatus", ...props })
  }
})

jest.mock("../WelcomeCard", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    WelcomeCard: (props: any) => R.createElement(View, { testID: "WelcomeCard", ...props })
  }
})

import { DashboardDock } from "../DashboardDock"

beforeAll(async () => {
  mockGetSetting.mockImplementation((key: string) => {
    if (key === "unitSystem") return Promise.resolve("metric")
    if (key === "timeFormat") return Promise.resolve("24h")
    return Promise.resolve("")
  })
  await loadDisplayPreferences()
})

const idleProps = {
  tracking: false,
  hasFix: false,
  locationEnabled: true,
  activeZoneName: null,
  pauseReason: null,
  activeProfileName: null,
  coords: null,
  lastKnown: null,
  stoppedByBattery: false,
  intervalText: "Every 30 s · Balanced",
  endpoint: "https://tracks.example.org/api",
  isOfflineMode: false,
  navigation: { navigate: jest.fn() },
  maxHeight: 390,
  firstRun: false,
  settings: DEFAULT_SETTINGS,
  colors: lightColors,
  onDismiss: jest.fn(),
  onStartTracking: jest.fn(),
  onNavigateToConnection: jest.fn(),
  onNavigateToTrackingSync: jest.fn(),
  onNavigateToRequestFormat: jest.fn()
}

const trackingProps = {
  ...idleProps,
  tracking: true,
  hasFix: true,
  coords: { accuracy: 4.2, timestamp: 1_700_000_000 }
}

const renderDock = (props: Partial<React.ComponentProps<typeof DashboardDock>> = {}) =>
  render(<DashboardDock {...idleProps} {...props} />)

describe("DashboardDock", () => {
  it("keeps the same three rows and two seams idle and tracking, so starting never shifts the dock", () => {
    const idle = renderDock()
    const idleShape = [
      idle.getByTestId("dock-state"),
      idle.getByTestId("dock-interval"),
      idle.getByTestId("ConnectionStatus")
    ].length
    expect(idleShape).toBe(3)
    expect(idle.UNSAFE_getAllByType(Divider)).toHaveLength(2)
    for (const divider of idle.UNSAFE_getAllByType(Divider)) {
      expect(divider.props.tight).toBe(true)
      expect(divider.props.inset).toBe(true)
    }
    expect(idle.getByLabelText("Ready, No fixes yet")).toBeTruthy()
    expect(idle.getByLabelText("Interval, Every 30 s · Balanced")).toBeTruthy()
    idle.unmount()

    const live = renderDock(trackingProps)
    expect(live.getByTestId("dock-state")).toBeTruthy()
    expect(live.getByTestId("dock-interval")).toBeTruthy()
    expect(live.getByTestId("ConnectionStatus")).toBeTruthy()
    expect(live.UNSAFE_getAllByType(Divider)).toHaveLength(2)
    expect(live.getByText("Tracking")).toBeTruthy()
    expect(live.getByText(/^±4 m · /)).toBeTruthy()
    expect(live.getByTestId("icon-CircleDot").props.color).toBe(lightColors.success)
  })

  it("drops the server row and its seam in offline mode, because there is no server to report", () => {
    const { queryByTestId, UNSAFE_getAllByType, getByTestId } = renderDock({ isOfflineMode: true })

    expect(queryByTestId("ConnectionStatus")).toBeNull()
    expect(UNSAFE_getAllByType(Divider)).toHaveLength(1)
    expect(getByTestId("dock-interval")).toBeTruthy()
  })

  it("hands the server row its endpoint and navigation, so a tap still opens Connection", () => {
    const { getByTestId } = renderDock()

    expect(getByTestId("ConnectionStatus").props.endpoint).toBe(idleProps.endpoint)
    expect(getByTestId("ConnectionStatus").props.navigation).toBe(idleProps.navigation)
  })

  it("shows the welcome checklist instead of the rows on first run and passes its callbacks through", () => {
    const { getByTestId, queryByTestId } = renderDock({ firstRun: true })

    const welcome = getByTestId("WelcomeCard")
    expect(welcome.props.onDismiss).toBe(idleProps.onDismiss)
    expect(welcome.props.onStartTracking).toBe(idleProps.onStartTracking)
    expect(welcome.props.settings).toBe(DEFAULT_SETTINGS)
    expect(queryByTestId("dock-state")).toBeNull()
    expect(queryByTestId("dock-interval")).toBeNull()
    expect(queryByTestId("ConnectionStatus")).toBeNull()
  })

  it("names the zone and the exit condition while paused, in a neutral tone since pausing is designed", () => {
    const { getByLabelText, getByTestId } = renderDock({
      ...trackingProps,
      activeZoneName: "Home",
      pauseReason: "wifi"
    })

    expect(getByLabelText("Paused in Home, Home WiFi · resumes when you leave")).toBeTruthy()
    expect(getByTestId("icon-CirclePause").props.color).toBe(lightColors.textSecondary)
  })

  it("spins the loader in the accent while searching, so a missing fix reads as work in progress", () => {
    const { getByText, getByTestId } = renderDock({ tracking: true, hasFix: false })

    expect(getByText("Searching for GPS")).toBeTruthy()
    expect(getByText("No fix yet")).toBeTruthy()
    expect(getByTestId("icon-Loader").props.color).toBe(lightColors.primary)
    expect(getByTestId("icon-Loader").props.size).toBe(size.icon.md)
  })

  it("flags a battery stop in the error hue after the banner has cleared", () => {
    const { getByLabelText, getByTestId } = renderDock({ stoppedByBattery: true })

    expect(getByLabelText("Tracking stopped, Battery fell below 5%")).toBeTruthy()
    expect(getByTestId("icon-CircleAlert").props.color).toBe(lightColors.error)
  })

  it("sits on the elevated row surface and caps its scroll at the height it is given", () => {
    const { UNSAFE_getByType } = renderDock({ maxHeight: 320 })

    expect(UNSAFE_getByType(Card).props.variant).toBe("elevated")
    expect(UNSAFE_getByType(Card).props.rows).toBe(true)
    const scroll = UNSAFE_getByType(ScrollView)
    expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBe(320)
    expect(scroll.props.showsVerticalScrollIndicator).toBe(false)
  })
})
