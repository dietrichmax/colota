import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"

// --- Mocks ---

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((cb) => cb()())
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: jest.requireActual("@colota/shared").lightColors })
}))

jest.mock("../../hooks/useTimeout", () => ({
  useTimeout: () => ({ set: jest.fn(), clear: jest.fn() })
}))

const mockGetStats = jest.fn().mockResolvedValue({ queued: 5, sent: 100, total: 105, today: 3, databaseSizeMB: 1.5 })
const mockManualFlush = jest.fn().mockResolvedValue(undefined)
const mockClearSentHistory = jest.fn().mockResolvedValue(undefined)
const mockClearQueue = jest.fn().mockResolvedValue(5)
const mockDeleteOlderThan = jest.fn().mockResolvedValue(10)
const mockVacuumDatabase = jest.fn().mockResolvedValue(undefined)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: function () {
      return mockGetStats.apply(null, arguments)
    },
    manualFlush: function () {
      return mockManualFlush.apply(null, arguments)
    },
    clearSentHistory: function () {
      return mockClearSentHistory.apply(null, arguments)
    },
    clearQueue: function () {
      return mockClearQueue.apply(null, arguments)
    },
    deleteOlderThan: function () {
      return mockDeleteOlderThan.apply(null, arguments)
    },
    vacuumDatabase: function () {
      return mockVacuumDatabase.apply(null, arguments)
    }
  }
}))

const mockShowConfirm = jest.fn().mockResolvedValue(true)

jest.mock("../../services/modalService", () => ({
  showConfirm: function () {
    return mockShowConfirm.apply(null, arguments)
  }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn() }
}))

let mockIsOfflineMode = false
jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: { isOfflineMode: mockIsOfflineMode }
  })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const RN = require("react-native")
  return {
    TextField: require("../../testing/componentStubs").TextFieldStub,
    Toggle: function (props: any) {
      return require("react").createElement(require("react-native").Switch, {
        testID: props.testID,
        value: props.value,
        onValueChange: props.onValueChange,
        disabled: props.disabled,
        accessibilityLabel: props.accessibilityLabel
      })
    },
    Button: function (props: any) {
      // variant and testID ride through, so a screen test can assert which button it asked for.
      return R.createElement(
        RN.Pressable,
        {
          testID: props.testID,
          variant: props.variant ?? "primary",
          onPress: props.onPress,
          disabled: props.disabled,
          accessibilityRole: "button"
        },
        R.createElement(RN.Text, null, props.title)
      )
    },
    SectionTitle: function (props: any) {
      return R.createElement(RN.Text, null, props.children)
    },
    Card: function (props: any) {
      return R.createElement(RN.View, null, props.children)
    },
    Container: function (props: any) {
      return R.createElement(RN.View, null, props.children)
    },
    Divider: function () {
      return R.createElement(RN.View, null)
    },
    FloatingSaveIndicator: function () {
      return null
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
    Lightbulb: stub("Lightbulb")
  }
})

// Mock NativeEventEmitter from react-native
const mockAddListener = jest.fn().mockReturnValue({ remove: jest.fn() })
jest.mock("react-native/Libraries/EventEmitter/NativeEventEmitter", () => {
  return {
    __esModule: true,
    default: function () {
      return {
        addListener: function () {
          return mockAddListener.apply(null, arguments)
        }
      }
    }
  }
})

import { DataManagementScreen } from "../DataManagementScreen"

describe("DataManagementScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsOfflineMode = false
    mockGetStats.mockResolvedValue({ queued: 5, sent: 100, total: 105, today: 3, databaseSizeMB: 1.5 })
    mockShowConfirm.mockResolvedValue(true)
  })

  function renderScreen() {
    return render(<DataManagementScreen navigation={{} as any} />)
  }

  it("says a cleanup row is a button, because nothing but the label marks it as one", async () => {
    const { getByLabelText } = renderScreen()

    await waitFor(() => expect(getByLabelText(/^Clear sent history,/)).toBeTruthy())
    expect(getByLabelText(/^Clear sent history,/).props.accessibilityRole).toBe("button")
  })

  it("paints every cleanup label in error, since all three delete locations for good", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => expect(getByText("Clear sent history")).toBeTruthy())
    for (const label of ["Clear sent history", "Clear queue"]) {
      expect(StyleSheet.flatten(getByText(label).props.style).color).toBe(lightColors.error)
    }
  })

  it("recedes a cleanup row with nothing to clear, so error does not advertise a dead action", async () => {
    mockGetStats.mockResolvedValue({ queued: 0, sent: 100, total: 100, today: 3, databaseSizeMB: 1.5 })
    const { getByText } = renderScreen()

    await waitFor(() => expect(getByText("Clear queue")).toBeTruthy())
    expect(StyleSheet.flatten(getByText("Clear queue").props.style).color).toBe(lightColors.textDisabled)
    expect(StyleSheet.flatten(getByText("Clear sent history").props.style).color).toBe(lightColors.error)
  })

  it("gives the retention Delete the danger fill, since it drops locations like the rows above it", async () => {
    const { getByTestId } = renderScreen()

    await waitFor(() => expect(getByTestId("delete-older-btn")).toBeTruthy())
    expect(getByTestId("delete-older-btn").props.variant).toBe("danger")
  })

  it("renders Data Management title", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Database statistics")).toBeTruthy()
    })
  })

  it("shows database statistics with correct values", async () => {
    const { getByText, getAllByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Total locations")).toBeTruthy()
      expect(getByText("105")).toBeTruthy()
      expect(getByText("Sent")).toBeTruthy()
      // "100" appears as stat value and as badge count for Clear Sent History
      expect(getAllByText("100").length).toBeGreaterThanOrEqual(1)
      expect(getByText("Queued")).toBeTruthy()
      expect(getAllByText("5").length).toBeGreaterThanOrEqual(1)
      expect(getByText("Today")).toBeTruthy()
      expect(getByText("3")).toBeTruthy()
      expect(getByText("Storage")).toBeTruthy()
      expect(getByText("1.50 MB")).toBeTruthy()
    })
  })

  it("shows Sync Now button", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Sync now")).toBeTruthy()
    })
  })

  it("disables Sync Now when queue is empty", async () => {
    mockGetStats.mockResolvedValue({ queued: 0, sent: 100, total: 100, today: 3, databaseSizeMB: 1.5 })

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Queue is empty")).toBeTruthy()
    })
  })

  it("shows Clear Sent History with badge count", async () => {
    const { getByText, getAllByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Clear sent history")).toBeTruthy()
      // "100" appears both as the Sent stat and as the Clear Sent History badge
      expect(getAllByText("100").length).toBeGreaterThanOrEqual(2)
    })
  })

  it("shows Clear Queue action", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Clear queue")).toBeTruthy()
    })
  })

  it("shows Delete Old Locations section with days input", async () => {
    const { getByText, getByDisplayValue } = renderScreen()

    await waitFor(() => {
      expect(getByText("Delete old locations")).toBeTruthy()
      expect(getByDisplayValue("90")).toBeTruthy()
      expect(getByText("days")).toBeTruthy()
      expect(getByText("Delete")).toBeTruthy()
    })
  })

  it("shows Optimize Database action", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Optimize database")).toBeTruthy()
      expect(getByText("Optimize")).toBeTruthy()
    })
  })



  it("Clear Sent History shows confirmation dialog", async () => {
    const { getByText, getAllByText } = renderScreen()

    // Wait for stats to load so the ActionRow is enabled (stats.sent > 0)
    await waitFor(() => {
      expect(getAllByText("100").length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.press(getByText("Clear sent history"))

    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Clear sent history",
          destructive: true
        })
      )
    })
  })

  describe("offline mode", () => {
    beforeEach(() => {
      mockIsOfflineMode = true
    })

    it("hides Sent and Queued stats", async () => {
      const { queryByText, getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Total locations")).toBeTruthy()
      })

      expect(queryByText("Sent")).toBeNull()
      expect(queryByText("Queued")).toBeNull()
    })

    it("hides Queue Actions section", async () => {
      const { queryByText, getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Database statistics")).toBeTruthy()
      })

      expect(queryByText("Queue actions")).toBeNull()
      expect(queryByText("Sync now")).toBeNull()
    })

    it("hides Clear Sent History and Clear Queue actions", async () => {
      const { queryByText, getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Database statistics")).toBeTruthy()
      })

      expect(queryByText("Clear sent history")).toBeNull()
      expect(queryByText("Clear queue")).toBeNull()
    })

    it("still shows Delete Old Locations and Optimize Database", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Delete old locations")).toBeTruthy()
        expect(getByText("Optimize database")).toBeTruthy()
      })
    })

    it("still shows Today and Storage stats", async () => {
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Today")).toBeTruthy()
        expect(getByText("Storage")).toBeTruthy()
      })
    })

    it("shows Delete All Locations action with total count", async () => {
      const { getByText, getAllByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Delete all locations")).toBeTruthy()
        // "105" appears as Total Locations stat and as Delete All badge
        expect(getAllByText("105").length).toBeGreaterThanOrEqual(2)
      })
    })

    it("Delete All Locations shows confirmation dialog", async () => {
      const { getByText, getAllByText } = renderScreen()

      await waitFor(() => {
        expect(getAllByText("105").length).toBeGreaterThanOrEqual(1)
      })

      fireEvent.press(getByText("Delete all locations"))

      await waitFor(() => {
        expect(mockShowConfirm).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Delete all locations",
            destructive: true
          })
        )
      })
    })
  })
})
