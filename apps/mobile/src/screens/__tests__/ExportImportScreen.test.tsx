import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter } from "react-native"

let mockRefocus: (() => void) | null = null
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react")
    R.useEffect(() => {
      let cleanup = cb()
      mockRefocus = () => {
        if (typeof cleanup === "function") cleanup()
        cleanup = cb()
      }
      return () => {
        if (typeof cleanup === "function") cleanup()
        mockRefocus = null
      }
    }, [cb])
  }
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

const mockGetStats = jest.fn()
const mockGetAutoExportStatus = jest.fn()
const mockExportToFile = jest.fn()
const mockShareFile = jest.fn()

// Every method on the real service is a static opening with `this.ensureModule()`, so a callback
// handed over unbound throws before it reaches native. The double loses its receiver the same way.
jest.mock("../../services/NativeLocationService", () => {
  const service: Record<string, unknown> = {}
  const onReceiver = (impl: (...a: unknown[]) => unknown) =>
    function (this: unknown, ...a: unknown[]) {
      if (this !== service) throw new TypeError("undefined is not a function")
      return impl(...a)
    }
  Object.assign(service, {
    getStats: onReceiver((...a) => mockGetStats(...a)),
    getAutoExportStatus: onReceiver((...a) => mockGetAutoExportStatus(...a)),
    exportToFile: onReceiver((...a) => mockExportToFile(...a)),
    shareFile: onReceiver((...a) => mockShareFile(...a))
  })
  return { __esModule: true, default: service }
})

const mockPickImportSource = jest.fn()
const mockImportLocationsFromFile = jest.fn()
const mockCommitImport = jest.fn()
const mockCancelImport = jest.fn()
jest.mock("../../services/ImportService", () => ({
  __esModule: true,
  default: {
    pickImportSource: (...a: unknown[]) => mockPickImportSource(...a),
    importLocationsFromFile: (...a: unknown[]) => mockImportLocationsFromFile(...a),
    commitImport: (...a: unknown[]) => mockCommitImport(...a),
    cancelImport: (...a: unknown[]) => mockCancelImport(...a)
  }
}))

const mockShowConfirm = jest.fn()
const mockShowAlert = jest.fn()
jest.mock("../../services/modalService", () => ({
  showConfirm: (...a: unknown[]) => mockShowConfirm(...a),
  showAlert: (...a: unknown[]) => mockShowAlert(...a)
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    StatRow: ({ label, value, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, value)),
    StateLine: ({ label, caption, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, caption)),
    FieldMessage: ({ children, variant }: any) =>
      R.createElement(Text, { accessibilityValue: { text: variant ?? "info" } }, children),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(View, null, R.createElement(Text, null, label), R.createElement(Text, null, hint), children),
    Toggle: ({ value, onValueChange, testID }: any) =>
      R.createElement(Pressable, { testID, onPress: () => onValueChange(!value) }),
    ListItem: ({ label, sub, testID, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        R.createElement(Text, null, sub)
      ),
    Button: ({ title, onPress, disabled, testID, loading }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, disabled, accessibilityState: { disabled: !!disabled, busy: !!loading } },
        R.createElement(Text, null, title)
      ),
    LoadingOverlay: ({ visible, title }: any) => (visible ? R.createElement(Text, null, title) : null),
    ExportFormatDialog: ({ visible, onSelect }: any) =>
      visible
        ? R.createElement(
            Pressable,
            { testID: "pick-geojson", onPress: () => onSelect("geojson") },
            R.createElement(Text, null, "Export format")
          )
        : null
  }
})

import { ExportImportScreen } from "../ExportImportScreen"

const stats = (over: Record<string, number> = {}) => ({ total: 12483, databaseSizeMB: 3.42, ...over })

const auto = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  running: false,
  format: "geojson",
  interval: "daily",
  uri: "content://tree",
  lastError: null,
  retentionCount: 10,
  ...over
})

const preview = (over: Record<string, unknown> = {}) => ({
  format: "geojson",
  totalParsed: 15908,
  invalid: 12,
  duplicates: 12415,
  newRows: 3481,
  dateRangeStartSec: 1552348800,
  dateRangeEndSec: 1788854400,
  canQueueForSync: true,
  ...over
})

const mockNavigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() }

const renderScreen = () => render(<ExportImportScreen navigation={mockNavigation as any} />)

const stage = async (api: ReturnType<typeof renderScreen>, over: Record<string, unknown> = {}) => {
  mockPickImportSource.mockResolvedValue({ uri: "content://file" })
  mockImportLocationsFromFile.mockResolvedValue(preview(over))
  fireEvent.press(api.getByTestId("import-file-btn"))
  await waitFor(() => expect(mockImportLocationsFromFile).toHaveBeenCalled())
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetStats.mockResolvedValue(stats())
  mockGetAutoExportStatus.mockResolvedValue(auto())
  mockShowConfirm.mockResolvedValue(true)
  mockCancelImport.mockResolvedValue(undefined)
  mockCommitImport.mockResolvedValue(3481)
  mockExportToFile.mockResolvedValue({
    filePath: "/cache/x.geojson",
    mimeType: "application/geo+json",
    rowCount: 12483
  })
  mockShareFile.mockResolvedValue(undefined)
})

describe("ExportImportScreen", () => {
  describe("what it says before anything is touched", () => {
    it("opens with the ledger and both verbs, and stages nothing", async () => {
      const api = renderScreen()

      expect(await api.findByText("12,483")).toBeTruthy()
      expect(api.getByText("3.42 MB")).toBeTruthy()
      expect(api.getByTestId("export-all-btn")).toBeTruthy()
      expect(api.getByTestId("import-file-btn")).toBeTruthy()
      expect(api.queryByTestId("import-commit-btn")).toBeNull()
      expect(mockPickImportSource).not.toHaveBeenCalled()
    })

    it("does not report an empty device while the first read is still running", async () => {
      mockGetStats.mockReturnValue(new Promise(() => {}))
      const api = renderScreen()

      // Both figures wait, rather than one of them claiming zero.
      expect(api.getAllByText("…")).toHaveLength(2)
      expect(api.queryByText("Nothing to export yet.")).toBeNull()
    })

    // The import half has no format control, so the sentence saying so has to be unconditionally true.
    it("offers no format control for an import", async () => {
      const api = renderScreen()
      await api.findByText("12,483")

      expect(api.getByText(/there is nothing to choose/)).toBeTruthy()
    })

    it("carries the auto-export state on the row that opens it", async () => {
      const api = renderScreen()

      expect(await api.findByText("Daily · GeoJSON · 10 files kept")).toBeTruthy()
    })

    it("disables the export with nothing to export, and says so", async () => {
      mockGetStats.mockResolvedValue(stats({ total: 0 }))
      const api = renderScreen()

      expect(await api.findByText("Nothing to export yet.")).toBeTruthy()
      expect(api.getByTestId("export-all-btn").props.accessibilityState.disabled).toBe(true)
    })
  })

  describe("export", () => {
    it("picks a format, writes the file and reports what went", async () => {
      const api = renderScreen()
      await api.findByText("12,483")

      fireEvent.press(api.getByTestId("export-all-btn"))
      fireEvent.press(api.getByTestId("pick-geojson"))

      await waitFor(() => expect(mockExportToFile).toHaveBeenCalledWith("geojson"))
      expect(await api.findByText("Exported 12,483 locations as GeoJSON and handed the file over.")).toBeTruthy()
    })

    // The share was caught and logged, so a hand-off that never happened looked like a success.
    it("says the file was written but nothing took it", async () => {
      mockShareFile.mockRejectedValue(new Error("no activity"))
      const api = renderScreen()
      await api.findByText("12,483")

      fireEvent.press(api.getByTestId("export-all-btn"))
      fireEvent.press(api.getByTestId("pick-geojson"))

      const line = await api.findByText(/no app took it/)
      expect(line.props.accessibilityValue.text).toBe("error")
    })
  })

  describe("import", () => {
    it("stages a file as a count and one line for what it skips", async () => {
      const api = renderScreen()
      await api.findByText("12,483")

      await stage(api)

      expect(await api.findByText("3,481 new locations")).toBeTruthy()
      expect(api.getByText("Skipping 12,415 duplicates and 12 unusable rows.")).toBeTruthy()
      expect(api.getByTestId("import-commit-btn")).toBeTruthy()
      expect(api.queryByTestId("import-file-btn")).toBeNull()
    })

    // The reasoning moved off the card into the confirmation, so it has to actually arrive there.
    it("puts the consequences in the confirmation, not on the card", async () => {
      const api = renderScreen()
      await api.findByText("12,483")
      await stage(api)

      fireEvent.press(api.getByTestId("import-commit-btn"))

      await waitFor(() =>
        expect(mockShowConfirm).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Import 3,481 locations?",
            message: expect.stringContaining("skipped rather than merged"),
            destructive: false
          })
        )
      )
      expect(mockCommitImport).toHaveBeenCalledWith(false)
    })

    it("carries the queue choice into the commit and the confirmation", async () => {
      const api = renderScreen()
      await api.findByText("12,483")
      await stage(api)

      fireEvent.press(api.getByTestId("queue-toggle"))
      fireEvent.press(api.getByTestId("import-commit-btn"))

      await waitFor(() => expect(mockCommitImport).toHaveBeenCalledWith(true))
      expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Import and queue" }))
    })

    it("commits nothing when the confirmation is dismissed", async () => {
      mockShowConfirm.mockResolvedValue(false)
      const api = renderScreen()
      await api.findByText("12,483")
      await stage(api)

      fireEvent.press(api.getByTestId("import-commit-btn"))

      await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled())
      expect(mockCommitImport).not.toHaveBeenCalled()
    })

    it("hides the queue switch when there is no server to queue to", async () => {
      const api = renderScreen()
      await api.findByText("12,483")

      await stage(api, { canQueueForSync: false })

      expect(await api.findByText("3,481 new locations")).toBeTruthy()
      expect(api.queryByTestId("queue-toggle")).toBeNull()
    })

    // Three reasons that all read as "no locations were found" before.
    it("separates an empty file from one whose rows were all unusable", async () => {
      const api = renderScreen()
      await api.findByText("12,483")

      await stage(api, { newRows: 0, totalParsed: 0, invalid: 12004, duplicates: 0 })

      expect(await api.findByText(/12,004 rows had no usable time or coordinates/)).toBeTruthy()
      expect(api.queryByTestId("import-commit-btn")).toBeNull()
    })

    it("frees the native stash when the file is discarded", async () => {
      const api = renderScreen()
      await api.findByText("12,483")
      await stage(api)

      fireEvent.press(api.getByTestId("import-discard-btn"))

      await waitFor(() => expect(mockCancelImport).toHaveBeenCalled())
      expect(api.getByTestId("import-file-btn")).toBeTruthy()
    })

    // The stash sits in native memory on a 15 minute timer, so leaving the screen has to free it.
    it("frees the native stash when the screen goes", async () => {
      const api = renderScreen()
      await api.findByText("12,483")
      await stage(api)

      api.unmount()

      expect(mockCancelImport).toHaveBeenCalled()
    })

    it("says why a file could not be read, in the scope the lock actually has", async () => {
      mockPickImportSource.mockResolvedValue({ uri: "content://file" })
      mockImportLocationsFromFile.mockRejectedValue({ code: "E_BUSY" })
      const api = renderScreen()
      await api.findByText("12,483")

      fireEvent.press(api.getByTestId("import-file-btn"))

      expect(await api.findByText("Another import is already running.")).toBeTruthy()
    })
  })

  it("re-reads the ledger on focus and on a new fix", async () => {
    const api = renderScreen()
    await api.findByText("12,483")

    mockGetStats.mockResolvedValue(stats({ total: 12500 }))
    act(() => {
      DeviceEventEmitter.emit("onLocationUpdate", {})
    })

    expect(await api.findByText("12,500")).toBeTruthy()

    mockGetStats.mockResolvedValue(stats({ total: 12600 }))
    await act(async () => {
      mockRefocus?.()
    })

    expect(await api.findByText("12,600")).toBeTruthy()
  })
})
