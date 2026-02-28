import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn((cb) => cb()())
}))

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

jest.mock("../../hooks/useTimeout", () => ({
  useTimeout: () => ({ set: jest.fn(), clear: jest.fn() })
}))

const mockGetStats = jest.fn().mockResolvedValue({ queued: 5, sent: 100, total: 105, today: 3, databaseSizeMB: 1.5 })
const mockGetSetting = jest.fn().mockResolvedValue("false")
const mockManualFlush = jest.fn().mockResolvedValue(undefined)
const mockClearSentHistory = jest.fn().mockResolvedValue(undefined)
const mockClearQueue = jest.fn().mockResolvedValue(5)
const mockDeleteOlderThan = jest.fn().mockResolvedValue(10)
const mockVacuumDatabase = jest.fn().mockResolvedValue(undefined)
const mockInsertDummyData = jest.fn().mockResolvedValue(200)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: function () {
      return mockGetStats.apply(null, arguments)
    },
    getSetting: function () {
      return mockGetSetting.apply(null, arguments)
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
    },
    insertDummyData: function () {
      return mockInsertDummyData.apply(null, arguments)
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

jest.mock("../../components", () => {
  const R = require("react")
  const RN = require("react-native")
  return {
    Button: function (props) {
      return R.createElement(
        RN.Pressable,
        { onPress: props.onPress, disabled: props.disabled, accessibilityRole: "button" },
        R.createElement(RN.Text, null, props.title)
      )
    },
    SectionTitle: function (props) {
      return R.createElement(RN.Text, null, props.children)
    },
    Card: function (props) {
      return R.createElement(RN.View, null, props.children)
    },
    Container: function (props) {
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
  function stub(name) {
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
    mockGetStats.mockResolvedValue({ queued: 5, sent: 100, total: 105, today: 3, databaseSizeMB: 1.5 })
    mockGetSetting.mockResolvedValue("false")
    mockShowConfirm.mockResolvedValue(true)
  })

  function renderScreen() {
    return render(<DataManagementScreen navigation={{} as any} />)
  }

  it("renders Data Management title", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Data Management")).toBeTruthy()
    })
  })

  it("shows database statistics with correct values", async () => {
    const { getByText, getAllByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Total Locations")).toBeTruthy()
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
      expect(getByText("Sync Now")).toBeTruthy()
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
      expect(getByText("Clear Sent History")).toBeTruthy()
      // "100" appears both as the Sent stat and as the Clear Sent History badge
      expect(getAllByText("100").length).toBeGreaterThanOrEqual(2)
    })
  })

  it("shows Clear Queue action", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Clear Queue")).toBeTruthy()
    })
  })

  it("shows Delete Old Locations section with days input", async () => {
    const { getByText, getByDisplayValue } = renderScreen()

    await waitFor(() => {
      expect(getByText("Delete Old Locations")).toBeTruthy()
      expect(getByDisplayValue("90")).toBeTruthy()
      expect(getByText("days")).toBeTruthy()
      expect(getByText("Delete")).toBeTruthy()
    })
  })

  it("shows Optimize Database action", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Optimize Database")).toBeTruthy()
      expect(getByText("Optimize")).toBeTruthy()
    })
  })

  it("shows DEV TOOLS section when debug mode enabled", async () => {
    mockGetSetting.mockResolvedValue("true")

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("DEV TOOLS")).toBeTruthy()
      expect(getByText("Insert Dummy Data")).toBeTruthy()
    })
  })

  it("hides DEV TOOLS section when debug mode disabled", async () => {
    mockGetSetting.mockResolvedValue("false")

    const { queryByText } = renderScreen()

    await waitFor(() => {
      expect(queryByText("DEV TOOLS")).toBeNull()
      expect(queryByText("Insert Dummy Data")).toBeNull()
    })
  })

  it("Clear Sent History shows confirmation dialog", async () => {
    const { getByText, getAllByText } = renderScreen()

    // Wait for stats to load so the ActionRow is enabled (stats.sent > 0)
    await waitFor(() => {
      expect(getAllByText("100").length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.press(getByText("Clear Sent History"))

    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Clear Sent History",
          destructive: true
        })
      )
    })
  })
})
