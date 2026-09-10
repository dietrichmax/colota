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
    ListItem: ({ label, sub, onPress, testID }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        R.createElement(Text, null, sub)
      ),
    Toggle: ({ value, onValueChange, testID, accessibilityLabel }: any) =>
      R.createElement(Pressable, { testID, accessibilityLabel, onPress: () => onValueChange(!value) }),
    Button: ({ title, onPress, disabled, testID, loading, variant }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          disabled,
          accessibilityState: { disabled: !!disabled, busy: !!loading },
          accessibilityValue: { text: variant ?? "primary" }
        },
        R.createElement(Text, null, title)
      )
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
  it("opens on the three steps, in the order a reporter does them", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("capture-state")).toBeTruthy())

    expect(api.getByText(/Start recording, reproduce the problem, then save the log file/)).toBeTruthy()
  })

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
    expect(api.queryByTestId("save-log-btn")).toBeNull()
  })
})

describe("the actions", () => {
  // With no file there is nothing to save, so the section is absent rather than disabled: a saved
  // log that was never recorded is the useless report the whole screen exists to prevent.
  it("offers no save or delete while the file is empty", async () => {
    mockGetFileLogSize.mockResolvedValue(0)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("capture-state")).toBeTruthy())

    expect(api.queryByTestId("save-log-btn")).toBeNull()
    expect(api.queryByTestId("delete-log-btn")).toBeNull()
    expect(api.getByText(/Leave this on while you reproduce the problem/)).toBeTruthy()
  })

  it("names what leaves the device before the folder picker opens", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-btn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-btn"))
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
    await waitFor(() => expect(api.getByTestId("save-log-btn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-btn"))
    })

    expect(mockExportFileLogToUri).toHaveBeenCalledWith("content://tree/logs", "HEADER\n", "APPLOG\n")
    expect(mockShowAlert).toHaveBeenCalledWith("Log saved", expect.any(String), "success")
  })

  it("does not report a save when the picker was dismissed", async () => {
    mockPickExportDirectory.mockResolvedValue(null)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-btn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-btn"))
    })

    expect(mockExportFileLogToUri).not.toHaveBeenCalled()
    expect(mockShowAlert).not.toHaveBeenCalled()
  })

  it("says so when there was nothing recorded to write", async () => {
    mockExportFileLogToUri.mockResolvedValue(null)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-btn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-btn"))
    })

    expect(mockShowAlert).toHaveBeenCalledWith("Nothing to save", expect.any(String), "info")
  })

  // A user-pressed failure that only logs leaves the reporter believing the file was written.
  it("alerts when the save fails", async () => {
    mockExportFileLogToUri.mockRejectedValue(new Error("Could not create document"))
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("save-log-btn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("save-log-btn"))
    })

    expect(mockShowAlert).toHaveBeenCalledWith("Could not save the log", "Could not create document", "error")
  })

  it("names the size it is about to delete, and asks first", async () => {
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("delete-log-btn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("delete-log-btn"))
    })

    expect(mockShowConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("2.4 MB"), destructive: true })
    )
    expect(mockClearFileLog).toHaveBeenCalled()
  })

  it("deletes nothing when the confirmation is dismissed", async () => {
    mockShowConfirm.mockResolvedValue(false)
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("delete-log-btn")).toBeTruthy())

    await act(async () => {
      fireEvent.press(api.getByTestId("delete-log-btn"))
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

    expect(api.getByText("The log file's most recent lines, newest first")).toBeTruthy()
    fireEvent.press(api.getByTestId("nav-log-preview"))
    expect(mockNavigation.navigate).toHaveBeenCalledWith("Log Preview")
  })

  it("says the other source while the capture is off", async () => {
    settings("false", "")
    const api = renderScreen()
    await waitFor(() => expect(api.getByTestId("nav-log-preview")).toBeTruthy())

    expect(api.getByText("The system log's last few minutes, newest first")).toBeTruthy()
  })
})
