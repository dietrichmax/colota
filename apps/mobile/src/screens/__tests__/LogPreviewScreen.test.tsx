import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"

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
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

const mockGetSetting = jest.fn()
jest.mock("../../services/NativeLocationService", () => {
  const service: Record<string, unknown> = {}
  Object.assign(service, {
    getSetting: function (this: unknown, ...a: unknown[]) {
      if (this !== service) throw new TypeError("undefined is not a function")
      return mockGetSetting(...a)
    }
  })
  return { __esModule: true, default: service }
})

const mockGetMergedLogs = jest.fn()
jest.mock("../../utils/logExport", () => ({
  getMergedLogs: (...a: unknown[]) => mockGetMergedLogs(...a)
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    EmptyState: ({ title, hint }: any) =>
      R.createElement(View, null, R.createElement(Text, null, title), R.createElement(Text, null, hint)),
    HeaderAction: ({ label, onPress, testID, disabled }: any) =>
      R.createElement(Pressable, { testID, onPress, disabled, accessibilityLabel: label }),
    ChipGroup: ({ options, selected, onSelect }: any) =>
      R.createElement(
        View,
        null,
        options.map((o: any) =>
          R.createElement(
            Pressable,
            {
              key: o.value,
              testID: o.testID,
              accessibilityState: { checked: selected === o.value },
              onPress: () => onSelect(o.value)
            },
            R.createElement(Text, null, o.label)
          )
        )
      )
  }
})

import { LogPreviewScreen } from "../LogPreviewScreen"

const AT = Date.parse("2026-09-09T09:46:58.000Z")

const entry = (level: string, message: string, offsetSeconds = 0) => ({
  id: `${level}-${message}`,
  time: AT + offsetSeconds * 1000,
  level,
  source: "NATIVE",
  message,
  raw: message
})

const mockNavigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() }
const renderScreen = () => render(<LogPreviewScreen navigation={mockNavigation as any} />)

const SAMPLE = [
  entry("DEBUG", "SyncManager: periodic sync stopped", 0),
  entry("INFO", "SyncManager: instant send", 1),
  entry("WARN", "SyncManager: no unmetered network", 2),
  entry("ERROR", "NetworkManager: connect timeout", 3)
]

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockGetMergedLogs.mockResolvedValue(SAMPLE)
  mockGetSetting.mockResolvedValue("true")
})

afterEach(() => {
  jest.useRealTimers()
})

describe("what the preview shows", () => {
  // What the reporter just reproduced is what they came to read, and descending order needs no
  // auto-stick, no scroll-to-end control and no measurement of variable-height rows.
  it("puts the most recent line first", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("log-result-line")).toBeTruthy())

    const messages = api.getAllByText(/SyncManager|NetworkManager/).map((n) => n.props.children)
    expect(messages[0]).toBe("NetworkManager: connect timeout")
    expect(messages[messages.length - 1]).toBe("SyncManager: periodic sync stopped")
  })

  // This previews what is being sent, so a default that hides most of the file misrepresents the
  // one thing under review.
  it("opens on every level", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("log-result-line")).toBeTruthy())

    expect(api.getByTestId("log-result-line").props.children).toBe("4 lines from the log file")
    expect(api.getByTestId("floor-all").props.accessibilityState.checked).toBe(true)
  })

  it("names the source it is reading, which the toggle silently decides", async () => {
    mockGetSetting.mockResolvedValue("false")
    const api = renderScreen()

    await waitFor(() => expect(api.getByTestId("log-result-line").props.children).toBe("4 lines from the system log"))
  })

  it("has an empty state for a log with nothing in it", async () => {
    mockGetMergedLogs.mockResolvedValue([])
    const api = renderScreen()

    await waitFor(() => expect(api.getByText("Nothing logged yet")).toBeTruthy())
  })
})

describe("the level floor", () => {
  it("shows every level at or above the one chosen", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("floor-warn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("floor-warn"))
    })

    expect(api.getByTestId("log-result-line").props.children).toBe("2 of 4 lines from the log file")
    expect(api.queryByText("SyncManager: instant send")).toBeNull()
    expect(api.getByText("NetworkManager: connect timeout")).toBeTruthy()
  })

  // The count rides on the chip, or learning there is one error means selecting Errors to find out,
  // which is changing state to read a fact.
  it("carries the count on each chip without needing a selection", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("floor-all")).toBeTruthy())

    expect(api.getByText("All 4")).toBeTruthy()
    expect(api.getByText("Warnings 2")).toBeTruthy()
    expect(api.getByText("Errors 1")).toBeTruthy()
  })

  it("has an empty state that tells the filter apart from an empty log", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("floor-error")).toBeTruthy())

    await act(async () => {
      fireEvent.changeText(api.getByTestId("log-search-input"), "nothing matches this")
      jest.advanceTimersByTime(200)
    })

    expect(api.getByText("No lines match")).toBeTruthy()
  })
})

describe("search", () => {
  it("filters on the message, after the typing settles", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("log-search-input")).toBeTruthy())

    await act(async () => {
      fireEvent.changeText(api.getByTestId("log-search-input"), "timeout")
    })
    expect(api.getByTestId("log-result-line").props.children).toBe("4 lines from the log file")

    await act(async () => {
      jest.advanceTimersByTime(200)
    })
    expect(api.getByTestId("log-result-line").props.children).toBe("1 of 4 lines from the log file")
  })

  // Counted over the search-matched set, so the active chip's number and the result line's first
  // number are the same number.
  it("counts the chips over what the search matched", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("log-search-input")).toBeTruthy())

    await act(async () => {
      fireEvent.changeText(api.getByTestId("log-search-input"), "SyncManager")
      jest.advanceTimersByTime(200)
    })

    expect(api.getByText("All 3")).toBeTruthy()
    expect(api.getByText("Errors 0")).toBeTruthy()
  })

  it("clears without waiting for the debounce", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("log-search-input")).toBeTruthy())

    await act(async () => {
      fireEvent.changeText(api.getByTestId("log-search-input"), "timeout")
      jest.advanceTimersByTime(200)
    })
    expect(api.getByTestId("log-result-line").props.children).toBe("1 of 4 lines from the log file")

    await act(async () => {
      fireEvent.press(api.getByTestId("clear-search-btn"))
    })
    expect(api.getByTestId("log-result-line").props.children).toBe("4 lines from the log file")
  })
})

describe("reading again", () => {
  // A preview that moves under the reader destroys a text selection before it can be used.
  it("does not poll", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("log-result-line")).toBeTruthy())
    const reads = mockGetMergedLogs.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(30000)
    })

    expect(mockGetMergedLogs.mock.calls.length).toBe(reads)
  })

  it("reads again when Refresh is pressed", async () => {
    renderScreen()
    await waitFor(() => expect(mockNavigation.setOptions).toHaveBeenCalled())
    const reads = mockGetMergedLogs.mock.calls.length

    const headerRight = mockNavigation.setOptions.mock.calls.at(-1)![0].headerRight
    const action = render(headerRight())
    await act(async () => {
      fireEvent.press(action.getByTestId("refresh-log-btn"))
    })

    expect(mockGetMergedLogs.mock.calls.length).toBe(reads + 1)
  })
})
