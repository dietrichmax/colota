import React from "react"
import { StatusBar } from "react-native"
import { render } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"

const mockNavigatorProps: Record<string, any>[] = []
const mockScreenProps: Record<string, any>[] = []

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children
}))

jest.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: (props: Record<string, any>) => {
      mockNavigatorProps.push(props)
      return props.children
    },
    Screen: (props: Record<string, any>) => {
      mockScreenProps.push(props)
      return null
    }
  })
}))

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children
}))

jest.mock("../src/hooks/useTheme", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ mode: "light", isDark: false, colors: require("@colota/shared").lightColors })
}))

jest.mock("../src/contexts/TrackingProvider", () => ({
  TrackingProvider: ({ children }: { children: React.ReactNode }) => children
}))

jest.mock("../src/components/ui/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children
}))

jest.mock("../src/components", () => ({ BottomTabBar: () => null }))

jest.mock("../src/screens/", () => new Proxy({}, { get: () => () => null }))

jest.mock("../src/i18n", () => ({}))
jest.mock("../src/utils/geo", () => ({ loadDisplayPreferences: jest.fn() }))
jest.mock("../src/utils/tileHeaders", () => ({ registerTileServerUserAgent: jest.fn() }))

import App from "../App"

describe("App chrome", () => {
  beforeEach(() => {
    mockNavigatorProps.length = 0
    mockScreenProps.length = 0
  })

  // One provider is what makes the icon set one weight. absoluteStrokeWidth is the half
  // that matters at the 16 floor: without it a 1.5 stroke scales down with the box and a
  // badge reads lighter than the tab glyph above it.
  it("mounts one Lucide provider carrying the absolute stroke", () => {
    const { getAllByTestId } = render(<App />)

    const providers = getAllByTestId("icon-LucideProvider")
    expect(providers).toHaveLength(1)
    expect(providers[0].props.strokeWidth).toBe(1.5)
    expect(providers[0].props.absoluteStrokeWidth).toBe(true)
  })

  // The hairline under every header comes from headerShadowVisible being unset, not from
  // the elevation and shadowOpacity that used to sit in headerStyle: native-stack ignores
  // both, so removing them alone would have left the line exactly where it was.
  it("turns the header shadow off rather than styling it away", () => {
    render(<App />)

    const { screenOptions } = mockNavigatorProps[0]
    expect(screenOptions.headerShadowVisible).toBe(false)
    expect(screenOptions.headerStyle).toEqual({ backgroundColor: lightColors.background })
  })

  // Every route but the two map heroes lost its in-screen H1, so the header is the only
  // place a screen is named and a vague header string leaves the screen unnamed. The route
  // name is the navigation key: renaming it would break every navigate() call, so the
  // displayed title moves and the key does not.
  it("names the screen in the header without renaming the route", () => {
    render(<App />)

    const titleFor = (name: string) => mockScreenProps.find((s) => s.name === name)?.options.headerTitle

    expect(titleFor("Auth Settings")).toBe("Authentication")
    expect(titleFor("API Config")).toBe("API field mapping")
    expect(titleFor("mTLS Settings")).toBe("Client certificate")
  })

  // RN's Android StatusBar module exposes only setStyle and setHidden, so backgroundColor
  // and translucent reached nothing. barStyle is the one prop that still does something.
  it("drives the status bar by bar style alone", () => {
    const { UNSAFE_getByType } = render(<App />)

    const bar = UNSAFE_getByType(StatusBar)
    expect(bar.props.barStyle).toBe("dark-content")
    expect(bar.props.backgroundColor).toBeUndefined()
    expect(bar.props.translucent).toBeUndefined()
  })
})
