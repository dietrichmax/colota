import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER, importDescription } from "../../utils/fileFormats"

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

const mockGetStats = jest.fn().mockResolvedValue({ total: 100 })

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: function () {
      return mockGetStats.apply(null, arguments)
    }
  }
}))

const mockPickImportSource = jest.fn()
const mockImportLocationsFromFile = jest.fn()
const mockCommitImport = jest.fn()
const mockCancelImport = jest.fn().mockResolvedValue(undefined)

jest.mock("../../services/ImportService", () => ({
  __esModule: true,
  default: {
    pickImportSource: function () {
      return mockPickImportSource.apply(null, arguments)
    },
    importLocationsFromFile: function () {
      return mockImportLocationsFromFile.apply(null, arguments)
    },
    commitImport: function () {
      return mockCommitImport.apply(null, arguments)
    },
    cancelImport: function () {
      return mockCancelImport.apply(null, arguments)
    }
  }
}))

const mockShowAlert = jest.fn()
const mockShowChoice = jest.fn()

jest.mock("../../services/modalService", () => ({
  showAlert: function () {
    return mockShowAlert.apply(null, arguments)
  },
  showChoice: function () {
    return mockShowChoice.apply(null, arguments)
  }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }
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
    LoadingOverlay: function (props: any) {
      return props.visible ? R.createElement(RN.Text, null, props.title) : null
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

import { ImportLocationsScreen } from "../ImportLocationsScreen"

const SOURCE = { uri: "content://pick/one.geojson", displayName: "one.geojson" }

function preview(over: Partial<Record<string, unknown>> = {}) {
  return {
    format: "geojson",
    totalParsed: 12,
    duplicates: 2,
    invalid: 0,
    newRows: 10,
    dateRangeStartSec: 1700000000,
    dateRangeEndSec: 1700086400,
    canQueueForSync: false,
    ...over
  }
}

function renderScreen() {
  return render(<ImportLocationsScreen navigation={{} as never} />)
}

describe("ImportLocationsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetStats.mockResolvedValue({ total: 100 })
    mockCancelImport.mockResolvedValue(undefined)
  })

  it("gives every listed format the same three lines the export picker shows", () => {
    const { getByText } = renderScreen()

    for (const key of IMPORT_FORMAT_ORDER) {
      const format = FILE_FORMATS[key]
      expect(getByText(format.label)).toBeTruthy()
      expect(getByText(`${format.subtitle} · ${format.extension}`)).toBeTruthy()
      expect(getByText(importDescription(format))).toBeTruthy()
    }
  })

  it("does nothing when the picker is dismissed, so no staged import is left behind", async () => {
    mockPickImportSource.mockResolvedValue(null)
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Choose file"))

    await waitFor(() => expect(mockPickImportSource).toHaveBeenCalled())
    expect(mockImportLocationsFromFile).not.toHaveBeenCalled()
    expect(mockShowAlert).not.toHaveBeenCalled()
  })

  it("releases the staged import when every point is a duplicate", async () => {
    // The native side holds the parsed rows until they are committed or cancelled, so returning
    // early without cancelling would block the next import with E_BUSY.
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview({ newRows: 0, duplicates: 12 }))
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Choose file"))

    await waitFor(() => expect(mockCancelImport).toHaveBeenCalled())
    expect(mockShowAlert).toHaveBeenCalledWith("Already imported", expect.stringContaining("12"), "info")
    expect(mockShowChoice).not.toHaveBeenCalled()
  })

  it("says nothing was found when the file parsed to no points at all", async () => {
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview({ newRows: 0, duplicates: 0, totalParsed: 0 }))
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Choose file"))

    await waitFor(() =>
      expect(mockShowAlert).toHaveBeenCalledWith("Nothing to import", expect.stringContaining("No locations"), "info")
    )
  })

  it("offers the sync choice only when the backend can take it", async () => {
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview({ canQueueForSync: false }))
    mockShowChoice.mockResolvedValue(0)
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Choose file"))

    await waitFor(() => expect(mockShowChoice).toHaveBeenCalled())
    expect(mockShowChoice.mock.calls[0][0].buttons).toHaveLength(2)
  })

  it("commits without queueing on Import, and with it on Import + Queue", async () => {
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview({ canQueueForSync: true }))
    mockCommitImport.mockResolvedValue(10)
    mockShowChoice.mockResolvedValue(1)
    const { getByText, rerender } = renderScreen()

    fireEvent.press(getByText("Choose file"))
    await waitFor(() => expect(mockCommitImport).toHaveBeenCalledWith(false))

    jest.clearAllMocks()
    mockGetStats.mockResolvedValue({ total: 110 })
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview({ canQueueForSync: true }))
    mockCommitImport.mockResolvedValue(10)
    mockShowChoice.mockResolvedValue(2)
    rerender(<ImportLocationsScreen navigation={{} as never} />)

    fireEvent.press(getByText("Choose file"))
    await waitFor(() => expect(mockCommitImport).toHaveBeenCalledWith(true))
  })

  it("cancels the staged import when the choice is dismissed", async () => {
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview())
    mockShowChoice.mockResolvedValue(0)
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Choose file"))

    await waitFor(() => expect(mockCancelImport).toHaveBeenCalled())
    expect(mockCommitImport).not.toHaveBeenCalled()
  })

  it("names the reason an import was refused rather than repeating the error code", async () => {
    // The native codes are the only thing the bridge returns, and E_BUSY is the one a user hits by
    // starting a second import while a backup runs.
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockRejectedValue({ code: "E_BUSY" })
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Choose file"))

    await waitFor(() =>
      expect(mockShowAlert).toHaveBeenCalledWith(
        "Import failed",
        "Another backup, restore or import is already in progress.",
        "error"
      )
    )
  })

  it("reports a failed commit without claiming the import succeeded", async () => {
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview())
    mockShowChoice.mockResolvedValue(1)
    mockCommitImport.mockRejectedValue({ code: "E_IMPORT_NO_PENDING" })
    const { getByText } = renderScreen()

    fireEvent.press(getByText("Choose file"))

    await waitFor(() =>
      expect(mockShowAlert).toHaveBeenCalledWith(
        "Import failed",
        "No staged import to commit. Choose a file again.",
        "error"
      )
    )
  })

  it("refreshes the recorded count after a commit, so the screen does not show a stale total", async () => {
    mockPickImportSource.mockResolvedValue(SOURCE)
    mockImportLocationsFromFile.mockResolvedValue(preview())
    mockShowChoice.mockResolvedValue(1)
    mockCommitImport.mockResolvedValue(10)
    const { getByText } = renderScreen()

    await waitFor(() => expect(mockGetStats).toHaveBeenCalledTimes(1))
    fireEvent.press(getByText("Choose file"))

    await waitFor(() => expect(mockGetStats).toHaveBeenCalledTimes(2))
  })
})
