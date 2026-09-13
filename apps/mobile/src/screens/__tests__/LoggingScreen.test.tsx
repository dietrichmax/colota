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
const mockGetFileLogSize = jest.fn()
const mockSetFileLoggingEnabled = jest.fn()
const mockClearFileLog = jest.fn()
const mockPickExportDirectory = jest.fn()
const mockExportFileLogToUri = jest.fn()
const mockGetBuildConfig = jest.fn()
const mockGetDeviceInfo = jest.fn()

// Every real method is a static opening with ensureModule(), so a bare reference throws.
jest.mock("../../services/NativeLocationService", () => {
  const service: Record<string, unknown> = {}
  const onReceiver = (impl: (...a: unknown[]) => unknown) =>
    function (this: unknown, ...a: unknown[]) {
      if (this !== service) throw new TypeError("undefined is not a function")
      return impl(...a)
    }
  Object.assign(service, {
    getSetting: onReceiver((...a) => mockGetSetting(...a)),
    getFileLogSize: onReceiver((...a) => mockGetFileLogSize(...a)),
    setFileLoggingEnabled: onReceiver((...a) => mockSetFileLoggingEnabled(...a)),
    clearFileLog: onReceiver((...a) => mockClearFileLog(...a)),
    pickExportDirectory: onReceiver((...a) => mockPickExportDirectory(...a)),
    exportFileLogToUri: onReceiver((...a) => mockExportFileLogToUri(...a)),
    getBuildConfig: onReceiver((...a) => mockGetBuildConfig(...a)),
    getDeviceInfo: onReceiver((...a) => mockGetDeviceInfo(...a))
  })
  return { __esModule: true, default: service }
})

const mockShowConfirm = jest.fn()
const mockShowAlert = jest.fn()
jest.mock("../../services/modalService", () => ({
  showConfirm: (...a: unknown[]) => mockShowConfirm(...a),
  showAlert: (...a: unknown[]) => mockShowAlert(...a)
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

jest.mock("../../utils/logExport", () => ({
  buildExportHeader: jest.fn(() => "HEADER\n"),
  buildAppLog: jest.fn(() => "APPLOG\n")
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    StateLine: ({ label, caption, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, caption)),
    FieldMessage: ({ children, variant }: any) =>
      R.createElement(Text, { accessibilityValue: { text: variant ?? "info" } }, children),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(View, null, R.createElement(Text, null, label), R.createElement(Text, null, hint), children),
    SpinningLoader: Object.assign(() => null, { displayName: "SpinningLoader" }),
    ListItem: ({ label, sub, onPress, testID, disabled, trailingIcon }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          disabled,
          accessibilityState: { disabled: !!disabled },
          accessibilityValue: { text: trailingIcon?.displayName ?? "chevron" }
        },
        R.createElement(Text, null, label),
        R.createElement(Text, null, sub)
      ),
    Toggle: ({ value, onValueChange, testID, accessibilityLabel }: any) =>
      R.createElement(Pressable, { testID, accessibilityLabel, onPress: () => onValueChange(!value) })
  }
})

import { LoggingScreen } from "../LoggingScreen"

const mockNavigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() }
const renderScreen = () => render(<LoggingScreen navigation={mockNavigation as any} />)

const settings = (enabled: string, startedAt: string) => {
  mockGetSetting.mockImplementation((key: string) => {
    if (key === "debugFileLoggingEnabled") return Promise.resolve(enabled)
    if (key === "debugFileLoggingStartedAt") return Promise.resolve(startedAt)
    return Promise.resolve("")
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  settings("true", "1757400000000")
  mockGetFileLogSize.mockResolvedValue(2_516_582)
  mockSetFileLoggingEnabled.mockResolvedValue(undefined)
  mockClearFileLog.mockResolvedValue(undefined)
  mockPickExportDirectory.mockResolvedValue("content://tree/logs")
  mockExportFileLogToUri.mockResolvedValue("content://tree/logs/colota-log.txt")
  mockGetBuildConfig.mockReturnValue({ VERSION_NAME: "1.16.0", VERSION_CODE: 48, FLAVOR: "gms" })
  mockGetDeviceInfo.mockResolvedValue({ systemVersion: "15", apiLevel: 35, brand: "Google", model: "Pixel 8" })
  mockShowConfirm.mockResolvedValue(true)
})

afterEach(() => {
  jest.useRealTimers()
})

describe("what the screen says on arrival", () => {
  it("reports the capture and what it has written", async () => {
    const api = renderScreen()

    await waitFor(() => expect(api.getByText("Recording")).toBeTruthy())
    expect(api.getByText(/^2\.4 MB since /)).toBeTruthy()
  })

  // Printing "No log file on this device" over 8 MB would be false, and the subtree only mounts to
  // be torn down.
  it("renders nothing about the capture until the first read lands", () => {
    settings("true", "0")
    mockGetFileLogSize.mockReturnValue(new Promise(() => {}))
    const api = renderScreen()

    expect(api.queryByTestId("capture-state")).toBeNull()
    expect(api.queryByTestId("save-log-row")).toBeNull()
  })
})

describe("the actions", () => {
  // With no file there is nothing to save, so the section is absent rather than disabled: a saved
  // log that was never recorded is the useless report the whole screen exists to prevent.
  it("offers no save or delete while the file is empty", async () => {
    mockGetFileLogSize.mockResolvedValue(0)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("capture-state")).toBeTruthy())

    expect(api.queryByTestId("save-log-row")).toBeNull()
    expect(api.queryByTestId("delete-log-row")).toBeNull()
    expect(api.getByText(/Leave this on while you reproduce the problem/)).toBeTruthy()
  })

  it("spins the running row, keeps it enabled and locks the other one", async () => {
    mockExportFileLogToUri.mockReturnValue(new Promise(() => {}))
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-row"))
    })

    await waitFor(() => expect(api.getByText("Saving…")).toBeTruthy())
    const save = api.getByTestId("save-log-row")
    expect(save.props.accessibilityValue.text).toBe("SpinningLoader")
    expect(save.props.accessibilityState.disabled).toBe(false)
    expect(api.getByTestId("delete-log-row").props.accessibilityValue.text).toBe("Trash2")
    expect(api.getByTestId("delete-log-row").props.accessibilityState.disabled).toBe(true)

    await act(async () => {
      fireEvent.press(save)
    })
    expect(mockExportFileLogToUri).toHaveBeenCalledTimes(1)
  })

  it("names what leaves the device before the folder picker opens", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-row"))
    })

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("geofences") })
    )
    expect(mockShowConfirm.mock.invocationCallOrder[0]).toBeLessThan(
      mockPickExportDirectory.mock.invocationCallOrder[0]
    )
  })

  // Native has no access to the JS ring buffer or the build config, so without these two arguments
  // the attached file carries no version, no flavor, no device and no JS line at all.
  it("hands native the header and the app log to merge in", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-row"))
    })

    expect(mockExportFileLogToUri).toHaveBeenCalledWith("content://tree/logs", "HEADER\n", "APPLOG\n")
    expect(mockShowAlert).toHaveBeenCalledWith("Log saved", expect.any(String), "success")
  })

  it("does not report a save when the picker was dismissed", async () => {
    mockPickExportDirectory.mockResolvedValue(null)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-row"))
    })

    expect(mockExportFileLogToUri).not.toHaveBeenCalled()
    expect(mockShowAlert).not.toHaveBeenCalled()
  })

  it("says so when there was nothing recorded to write", async () => {
    mockExportFileLogToUri.mockResolvedValue(null)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-row"))
    })

    expect(mockShowAlert).toHaveBeenCalledWith("Nothing to save", expect.any(String), "info")
  })

  // A user-pressed failure that only logs leaves the reporter believing the file was written.
  it("alerts when the save fails", async () => {
    mockExportFileLogToUri.mockRejectedValue(new Error("Could not create document"))
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-row"))
    })

    expect(mockShowAlert).toHaveBeenCalledWith("Could not save the log", "Could not create document", "error")
  })

  it("names the size it is about to delete, and asks first", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("delete-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("delete-log-row"))
    })

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("2.4 MB"), destructive: true })
    )
    expect(mockClearFileLog).toHaveBeenCalled()
  })

  it("deletes nothing when the confirmation is dismissed", async () => {
    mockShowConfirm.mockResolvedValue(false)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("delete-log-row")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("delete-log-row"))
    })

    expect(mockClearFileLog).not.toHaveBeenCalled()
  })
})

describe("the toggle", () => {
  // Native stamps the start and the first lines land off-thread, so the size is read once after the
  // write settles. A poll would rebuild the view continuously for a number that rarely moves.
  it("reads back once after the write settles, rather than polling", async () => {
    settings("false", "")
    mockGetFileLogSize.mockResolvedValue(0)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("file-logging-toggle")).toBeTruthy())
    const readsAfterMount = mockGetFileLogSize.mock.calls.length

    await act(async () => {
      fireEvent.press(api.getByTestId("file-logging-toggle"))
    })
    expect(mockSetFileLoggingEnabled).toHaveBeenCalledWith(true)
    expect(mockGetFileLogSize.mock.calls.length).toBe(readsAfterMount)

    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    expect(mockGetFileLogSize.mock.calls.length).toBe(readsAfterMount + 1)
  })

  // A toggle that snaps back with no explanation reads as the app ignoring the press.
  it("puts the switch back and says so when the write fails", async () => {
    settings("false", "")
    mockSetFileLoggingEnabled.mockRejectedValue(new Error("db locked"))
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("file-logging-toggle")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("file-logging-toggle"))
    })

    expect(mockShowAlert).toHaveBeenCalledWith("Could not change logging", expect.any(String), "error")
    expect(api.getByText("Not recording")).toBeTruthy()
  })
})

describe("the reader", () => {
  it("says which source it will show, and opens it", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("nav-log-preview")).toBeTruthy())

    expect(api.getByText("The log file's most recent lines")).toBeTruthy()
    fireEvent.press(api.getByTestId("nav-log-preview"))
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Log Preview")
  })

  it("says the other source while the capture is off", async () => {
    settings("false", "")
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("nav-log-preview")).toBeTruthy())

    expect(api.getByText("The system log's last few minutes")).toBeTruthy()
  })
})
