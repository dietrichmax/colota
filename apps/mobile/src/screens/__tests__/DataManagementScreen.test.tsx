import React from "react"
import { render, fireEvent, waitFor, act, within } from "@testing-library/react-native"
import { DeviceEventEmitter } from "react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"

// The device re-invokes the same captured callback on every focus, and a callback whose
// dependencies are all stable is captured once and never rebuilt. A test has to be able to fire it
// again or every closure-capture bug in a focus effect is invisible.
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

// The preview debounce coalesces the way it does on a device: a callback scheduled while an earlier
// one is pending replaces it, so keystrokes inside one tick produce a single count. Longer timers
// are held rather than dropped, so a test can decide when the flush fallback fires and can count how
// often it was re-armed. The object is stable per hook instance, as the real hook's is, or a caller
// listing it as a dependency loops.
const mockLongTimers: Array<{ later: (() => void) | null }> = []
let mockLongArms = 0
jest.mock("../../hooks/useTimeout", () => {
  const R = require("react")
  const { RETENTION_PREVIEW_DEBOUNCE_MS } = jest.requireActual("../../constants")
  return {
    useTimeout: () => {
      const ref = R.useRef(null)
      if (!ref.current) {
        ref.current = { pending: null, later: null }
        mockLongTimers.push(ref.current)
      }
      const state = ref.current
      return R.useMemo(
        () => ({
          set: (fn: () => void, delay: number) => {
            if (delay !== RETENTION_PREVIEW_DEBOUNCE_MS) {
              mockLongArms += 1
              state.later = fn
              return
            }
            state.pending = fn
            Promise.resolve().then(() => {
              if (state.pending !== fn) return
              state.pending = null
              fn()
            })
          },
          clear: () => {
            state.pending = null
            state.later = null
          }
        }),
        [state]
      )
    }
  }
})

/** Runs whatever long timer is currently armed, the way the device would after its delay elapsed. */
const fireLongTimers = () => mockLongTimers.forEach((t) => t.later?.())

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = true
jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({ settings: mockSettings, tracking: mockTracking })
}))

const mockGetStats = jest.fn()
const mockCountOlderThan = jest.fn()
const mockCountUnsentOlderThan = jest.fn()
/** The boundary native reports back, so the dialog's date is pinned rather than read off the clock. */
const CUTOFF = 1735689600
const mockManualFlush = jest.fn()
const mockClearSentHistory = jest.fn()
const mockClearQueue = jest.fn()
const mockClearAllLocations = jest.fn()
const mockDeleteOlderThan = jest.fn()
const mockVacuumDatabase = jest.fn()

// Every real method is a static opening with `this.ensureModule()`, so a callback handed over
// unbound throws before it reaches native. Arrows on a plain object would swallow that and a dead
// button would pass, so the mock loses its receiver the same way the real service does.
jest.mock("../../services/NativeLocationService", () => {
  const service: Record<string, unknown> = {}
  const onReceiver = (impl: (...a: unknown[]) => unknown) =>
    function (this: unknown, ...a: unknown[]) {
      if (this !== service) throw new TypeError("undefined is not a function")
      return impl(...a)
    }
  Object.assign(service, {
    getStats: onReceiver((...a) => mockGetStats(...a)),
    countOlderThan: onReceiver((...a) => mockCountOlderThan(...a)),
    countUnsentOlderThan: onReceiver((...a) => mockCountUnsentOlderThan(...a)),
    manualFlush: onReceiver((...a) => mockManualFlush(...a)),
    clearSentHistory: onReceiver((...a) => mockClearSentHistory(...a)),
    clearQueue: onReceiver((...a) => mockClearQueue(...a)),
    clearAllLocations: onReceiver((...a) => mockClearAllLocations(...a)),
    deleteOlderThan: onReceiver((...a) => mockDeleteOlderThan(...a)),
    vacuumDatabase: onReceiver((...a) => mockVacuumDatabase(...a))
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

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    StatRow: ({ label, value, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, value)),
    EmptyState: ({ title, hint }: any) =>
      R.createElement(View, null, R.createElement(Text, null, title), R.createElement(Text, null, hint)),
    FieldMessage: ({ children, variant }: any) =>
      R.createElement(Text, { accessibilityValue: { text: variant ?? "info" } }, children),
    Button: ({ title, onPress, disabled, testID, variant, color }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          disabled,
          accessibilityRole: "button",
          accessibilityState: { disabled: !!disabled },
          accessibilityValue: { text: `${variant ?? "primary"}${color ? "/error" : ""}` }
        },
        R.createElement(Text, null, title)
      ),
    ListItem: ({ testID, label, sub, onPress, disabled, trailingIcon }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          disabled,
          accessibilityRole: "button",
          accessibilityState: { disabled: !!disabled },
          accessibilityValue: { text: trailingIcon ? "trash" : "chevron" }
        },
        R.createElement(Text, null, label),
        R.createElement(Text, null, sub)
      ),
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
              onPress: () => onSelect(o.value),
              accessibilityState: { selected: selected === o.value }
            },
            R.createElement(Text, null, o.label)
          )
        )
      ),
    NumericInput: ({ label, value, onChange, onBlur, unit, hint, error, message, testID }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint ? R.createElement(Text, null, hint) : null,
        R.createElement(TextInput, { testID, value, onChangeText: onChange, onBlur }),
        R.createElement(Text, null, unit),
        error ? R.createElement(Text, null, error) : null,
        message ? R.createElement(Text, null, message) : null
      )
  }
})

import { DataManagementScreen } from "../DataManagementScreen"

const props = { navigation: { navigate: jest.fn() }, route: { key: "d", name: "Data Management" } } as any
const renderScreen = () => render(<DataManagementScreen {...props} />)
const stats = (over: Partial<Record<string, number | string>> = {}) => ({
  queued: 412,
  sent: 12068,
  total: 12480,
  today: 142,
  databaseSizeMB: 3.4213,
  lastSyncTime: 0,
  lastSyncError: "",
  ...over
})

describe("DataManagementScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track" }
    mockTracking = true
    mockGetStats.mockResolvedValue(stats())
    mockCountOlderThan.mockResolvedValue({ total: 3120, cutoffSeconds: CUTOFF })
    mockCountUnsentOlderThan.mockResolvedValue(96)
    mockClearQueue.mockResolvedValue(412)
    mockClearSentHistory.mockResolvedValue(12068)
    mockClearAllLocations.mockResolvedValue(12480)
    mockDeleteOlderThan.mockResolvedValue(3120)
    mockVacuumDatabase.mockResolvedValue(undefined)
    mockManualFlush.mockResolvedValue(undefined)
    mockShowConfirm.mockResolvedValue(true)
  })

  describe("the ledger", () => {
    it("shows two figures in the shape the Settings row that opens this screen prints", async () => {
      const api = renderScreen()

      expect(await api.findByText("12,480")).toBeTruthy()
      expect(api.getByText("3.42 MB")).toBeTruthy()
    })

    it("carries no Sent, Queued or Today figure, because those parts never sum to the total", async () => {
      // Offline-recorded rows are neither sent nor queued, and a mid-sync read can make the parts exceed the whole.
      const api = renderScreen()
      await api.findByText("12,480")

      expect(api.queryByText("12,068")).toBeNull()
      expect(api.queryByText("142")).toBeNull()
      expect(api.queryByTestId("stat-queued")).toBeNull()
    })

    it("refreshes on a sync event rather than polling every three seconds", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      mockGetStats.mockResolvedValue(stats({ total: 12500 }))
      act(() => {
        DeviceEventEmitter.emit("onSyncProgress", { sent: 1, failed: 0, total: 1, remaining: 0 })
      })

      expect(await api.findByText("12,500")).toBeTruthy()
    })
  })

  describe("what each delete says it takes", () => {
    it("tells the queued row the recordings go and no copy survives", async () => {
      const api = renderScreen()

      expect(
        await api.findByText("412 locations waiting to upload. Nothing else holds a copy, and they leave History too.")
      ).toBeTruthy()
    })

    it("tells the synced row that an import counts as synced, which no label said before", async () => {
      const api = renderScreen()

      expect(
        await api.findByText("12,068 locations already on your server. Imported locations count as synced.")
      ).toBeTruthy()
    })

    it("names the trip splits and merges under Delete all, which no label, hint or dialog named", async () => {
      const api = renderScreen()

      expect(
        await api.findByText(
          "All 12,480 locations and every trip split and merge you made. Geofences, profiles and settings stay."
        )
      ).toBeTruthy()
    })

    it("explains a disabled row in the same slot rather than leaving it blank", async () => {
      mockGetStats.mockResolvedValue(stats({ queued: 0 }))
      const api = renderScreen()

      expect(await api.findByText("Nothing queued.")).toBeTruthy()
      expect(api.getByTestId("delete-queued-row").props.accessibilityState.disabled).toBe(true)
    })
  })

  describe("confirming a delete", () => {
    it("quotes a count read at the moment of the press, never the one on screen", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      mockGetStats.mockResolvedValue(stats({ sent: 12100 }))

      fireEvent.press(api.getByTestId("delete-synced-row"))

      await waitFor(() =>
        expect(mockShowConfirm).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Delete 12,100 synced locations?", destructive: true })
        )
      )
      expect(mockClearSentHistory).toHaveBeenCalled()
    })

    it("deletes nothing when the dialog is dismissed", async () => {
      mockShowConfirm.mockResolvedValue(false)
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("delete-all-btn"))

      await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled())
      expect(mockClearAllLocations).not.toHaveBeenCalled()
    })

    it("asks for a distinct verb on the one that empties everything", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("delete-all-btn"))

      await waitFor(() =>
        expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Delete all" }))
      )
    })

    // A confirmed delete has to reach native. Asserting only the dialog let three dead buttons ship.
    it.each([
      ["delete-queued-row", () => mockClearQueue],
      ["delete-synced-row", () => mockClearSentHistory],
      ["delete-all-btn", () => mockClearAllLocations]
    ])("runs the native delete behind %s once confirmed", async (testID, fn) => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId(testID as string))

      await waitFor(() => expect((fn as () => jest.Mock)()).toHaveBeenCalled())
      expect(mockShowAlert).not.toHaveBeenCalled()
    })

    it("runs the native delete behind the age button once an age is chosen and confirmed", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("age-90"))
      await api.findByText("Delete 3,120 locations")

      fireEvent.press(api.getByTestId("delete-older-btn"))

      await waitFor(() => expect(mockDeleteOlderThan).toHaveBeenCalledWith(90))
      expect(mockShowAlert).not.toHaveBeenCalled()
    })

    it("reports a failure instead of leaving the screen looking successful", async () => {
      // The rejection has to come from native. A handler that threw before reaching it would raise
      // the same alert, which is how a dead button once passed this test.
      mockClearQueue.mockRejectedValue(new Error("db"))
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("delete-queued-row"))

      await waitFor(() =>
        expect(mockShowAlert).toHaveBeenCalledWith(
          "Delete failed",
          "The database reported an error. Check the figures above before trying again.",
          "error"
        )
      )
      expect(mockClearQueue).toHaveBeenCalled()
    })

    it("spends the one filled danger button on Delete all and keeps the age delete a text button", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      expect(api.getByTestId("delete-all-btn").props.accessibilityValue.text).toBe("danger")
      expect(api.getByTestId("delete-older-btn").props.accessibilityValue.text).toBe("ghost/error")
    })
  })

  describe("the age argument", () => {
    // An age is an argument to a delete, so opening the screen must not choose one, must not count
    // for one, and must not arm one.
    it("chooses nothing on open, so it counts nothing and arms nothing", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      expect(mockCountOlderThan).not.toHaveBeenCalled()
      expect(api.getByText("Choose how old a location must be.")).toBeTruthy()
      expect(api.getByTestId("delete-older-btn").props.accessibilityState.disabled).toBe(true)
    })

    it("counts once an age is chosen, and names the boundary it counted at", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("age-90"))

      expect(await api.findByText("Delete 3,120 locations")).toBeTruthy()
      expect(mockCountOlderThan).toHaveBeenCalledWith(90)
    })

    // The unsent count reads every matching row, so it is worth taking once, on the press.
    it("keeps the never-uploaded count off the typing path and puts it in the confirmation", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("age-90"))
      await api.findByText("Delete 3,120 locations")

      expect(mockCountUnsentOlderThan).not.toHaveBeenCalled()

      fireEvent.press(api.getByTestId("delete-older-btn"))

      await waitFor(() => expect(mockCountUnsentOlderThan).toHaveBeenCalledWith(90))
      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("96 of them have never been uploaded") })
      )
    })

    it("re-counts when the age changes", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("age-90"))
      await api.findByText("Delete 3,120 locations")

      mockCountOlderThan.mockResolvedValue({ total: 40, cutoffSeconds: CUTOFF })
      fireEvent.press(api.getByTestId("age-365"))

      expect(await api.findByText("Delete 40 locations")).toBeTruthy()
      expect(mockCountOlderThan).toHaveBeenLastCalledWith(365)
    })

    it("offers no delete when nothing matches", async () => {
      mockCountOlderThan.mockResolvedValue({ total: 0, cutoffSeconds: CUTOFF })
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("age-90"))

      expect(await api.findByText("Nothing on this device is older than 90 days.")).toBeTruthy()
      expect(api.getByTestId("delete-older-btn").props.accessibilityState.disabled).toBe(true)
    })

    it("rejects a decimal instead of silently deleting by its integer part", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("age-custom"))

      fireEvent.changeText(api.getByTestId("retention-days-input"), "1.5")

      expect(await api.findByText("A whole number")).toBeTruthy()
      // The field owns the error; the button points at it rather than printing it twice.
      expect(api.getByText("Fix the age above.")).toBeTruthy()
      expect(api.getByTestId("delete-older-btn").props.accessibilityState.disabled).toBe(true)
    })

    it("restores the last settled age on blur, never the minimum, so an emptied box cannot arm a one-day delete", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("age-custom"))
      fireEvent.changeText(api.getByTestId("retention-days-input"), "365")
      await waitFor(() => expect(mockCountOlderThan).toHaveBeenLastCalledWith(365))
      fireEvent.changeText(api.getByTestId("retention-days-input"), "")

      fireEvent(api.getByTestId("retention-days-input"), "blur")

      expect(api.getByTestId("retention-days-input").props.value).toBe("365")
      expect(await api.findByText("Set to 365 days")).toBeTruthy()
      expect(mockCountOlderThan).not.toHaveBeenCalledWith(1)
    })

    // Recording per keystroke caught every prefix, so clearing 365 armed a delete for 3 days.
    it("never restores a keystroke the count skipped", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("age-custom"))
      fireEvent.changeText(api.getByTestId("retention-days-input"), "365")
      fireEvent.changeText(api.getByTestId("retention-days-input"), "36")
      fireEvent.changeText(api.getByTestId("retention-days-input"), "3")
      fireEvent.changeText(api.getByTestId("retention-days-input"), "")

      fireEvent(api.getByTestId("retention-days-input"), "blur")

      expect(api.getByTestId("retention-days-input").props.value).toBe("")
      expect(mockCountOlderThan).not.toHaveBeenCalledWith(3)
      expect(mockCountOlderThan).not.toHaveBeenCalledWith(36)
    })

    // The focus callback is built once from stable dependencies, so anything it reads off state is
    // frozen at the first render. Counting from inside it wiped a count the user had asked for.
    it("keeps the count when the screen is left and come back to", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("age-90"))
      await api.findByText("Delete 3,120 locations")

      await act(async () => {
        mockRefocus?.()
      })

      expect(api.getByText("Delete 3,120 locations")).toBeTruthy()
      expect(api.getByTestId("delete-older-btn").props.accessibilityState.disabled).toBe(false)
    })

    // Nothing has settled, so there is nothing to fall back to and nothing may be armed.
    it("leaves an emptied field empty when no age has ever settled", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("age-custom"))

      fireEvent(api.getByTestId("retention-days-input"), "blur")

      expect(api.getByTestId("retention-days-input").props.value).toBe("")
      expect(api.getByTestId("delete-older-btn").props.accessibilityState.disabled).toBe(true)
      expect(mockCountOlderThan).not.toHaveBeenCalled()
    })
  })

  describe("sync now", () => {
    beforeEach(() => {
      mockLongTimers.length = 0
      mockLongArms = 0
    })

    it("says what it overrides, and that a flush records nothing", async () => {
      mockTracking = false
      const api = renderScreen()

      expect(
        await api.findByText(
          "Uploads the 412 queued locations now, whatever Sync only on says. The tracking notification appears for a moment. Nothing is recorded."
        )
      ).toBeTruthy()
    })

    it("is disabled with the reason when no server is configured, since native does nothing", async () => {
      mockSettings = { ...DEFAULT_SETTINGS, endpoint: "" }
      const api = renderScreen()

      expect(await api.findByText("No server configured. Set one on Connection.")).toBeTruthy()
      expect(api.getByTestId("sync-now-btn").props.accessibilityState.disabled).toBe(true)
    })

    it("reports the run from the progress event and never claims success after failures", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())

      // Native's real shape: ticks while it works, then one event carrying `remaining` to end the pass.
      act(() => {
        DeviceEventEmitter.emit("onSyncProgress", { sent: 400, failed: 0, total: 412 })
        DeviceEventEmitter.emit("onSyncProgress", { sent: 400, failed: 12, total: 412, remaining: 12 })
      })

      const line = await api.findByText("Sent 400 of 412. Some uploads failed. 12 still queued; press again.")
      expect(line.props.accessibilityValue.text).toBe("error")
    })

    it("says how many are left when a pass hits the batch cap", async () => {
      mockGetStats.mockResolvedValue(stats({ queued: 620 }))
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())
      act(() => {
        DeviceEventEmitter.emit("onSyncProgress", { sent: 500, failed: 0, total: 500, remaining: 120 })
      })

      expect(await api.findByText("Sent 500 of 620. 120 still queued; press again.")).toBeTruthy()
    })

    // A pass caps at a fixed number of batches, so its running count never reaches the queue it
    // started with. Waiting for that is what made a good upload report a failure 30 seconds later.
    it("finishes on the pass-end event rather than waiting for the running count to reach the queue", async () => {
      mockGetStats.mockResolvedValue(stats({ queued: 5000 }))
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())
      act(() => {
        DeviceEventEmitter.emit("onSyncProgress", { sent: 500, failed: 0, total: 5000, remaining: 4500 })
      })

      expect(await api.findByText("Sent 500 of 5,000. 4,500 still queued; press again.")).toBeTruthy()
      expect(api.queryByText("No answer from the tracking service. The queue is unchanged.")).toBeNull()
      await waitFor(() => expect(api.getByTestId("sync-now-btn").props.accessibilityState.disabled).toBe(false))
    })

    it("says the queue emptied when it did, and nothing about pressing again", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())
      mockGetStats.mockResolvedValue(stats({ queued: 0 }))
      act(() => {
        DeviceEventEmitter.emit("onSyncProgress", { sent: 412, failed: 0, total: 412, remaining: 0 })
      })

      const line = await api.findByText("Sent 412 of 412.")
      expect(line.props.accessibilityValue.text).toBe("info")
      expect(api.queryByText(/press again/)).toBeNull()
    })

    // A pass where every upload failed never fires a progress tick, because the tick sites are gated
    // on a batch succeeding, so a terminal event of zero and zero is what a total failure looks like.
    it("does not report a pass that moved nothing as ordinary progress", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())
      act(() => {
        DeviceEventEmitter.emit("onSyncProgress", { sent: 0, failed: 412, total: 412, remaining: 412 })
      })

      const line = await api.findByText("Sent 0 of 412. Some uploads failed. 412 still queued; press again.")
      expect(line.props.accessibilityValue.text).toBe("error")
    })

    // The fallback means no event for the window, not no ending within the window of the press. Armed
    // once, a pass that keeps reporting past 30 s is declared dead while it is still uploading.
    it("re-arms its silence timer on every progress event", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockLongArms).toBe(1))

      act(() => {
        DeviceEventEmitter.emit("onSyncProgress", { sent: 100, failed: 0, total: 412 })
      })

      expect(mockLongArms).toBe(2)
      expect(await api.findByText("Sent 100 of 412.")).toBeTruthy()
    })

    it("blames the silence rather than the queue when nothing answers", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())
      await act(async () => {
        fireLongTimers()
      })

      const line = await api.findByText("No answer from the tracking service. Check the queued count above.")
      expect(line.props.accessibilityValue.text).toBe("error")
      await waitFor(() => expect(api.getByTestId("sync-now-btn").props.accessibilityState.disabled).toBe(false))
    })

    it("stops listening for progress once the screen is gone", async () => {
      const api = renderScreen()
      await api.findByText("12,480")
      fireEvent.press(api.getByTestId("sync-now-btn"))
      await waitFor(() => expect(mockManualFlush).toHaveBeenCalled())
      const during = DeviceEventEmitter.listenerCount("onSyncProgress")

      api.unmount()

      expect(DeviceEventEmitter.listenerCount("onSyncProgress")).toBeLessThan(during)
    })

    it("leaves the screen entirely in offline mode, where the queue is frozen", async () => {
      mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }
      const api = renderScreen()
      await api.findByText("12,480")

      expect(api.queryByTestId("sync-now-btn")).toBeNull()
      expect(api.queryByTestId("delete-queued-row")).toBeNull()
      expect(api.getByTestId("delete-all-btn")).toBeTruthy()
    })
  })

  describe("what the screen claims before it knows", () => {
    it("does not report an empty device while the first count is still running", async () => {
      mockGetStats.mockReturnValue(new Promise(() => {}))
      const api = renderScreen()

      expect(api.queryByText("Nothing stored")).toBeNull()
      expect(api.queryByTestId("delete-all-btn")).toBeNull()
      expect(within(api.getByTestId("stat-locations")).getByText("…")).toBeTruthy()
    })

    // Every read is numbered, so an earlier one landing late cannot revive a deleted database.
    it("keeps the newer count when a slower earlier read lands after it", async () => {
      let releaseSlow: (v: unknown) => void = () => {}
      mockGetStats
        .mockReturnValueOnce(new Promise((resolve) => (releaseSlow = resolve)))
        .mockResolvedValue(stats({ total: 7 }))
      const api = renderScreen()

      act(() => {
        DeviceEventEmitter.emit("onLocationUpdate", {})
      })
      await waitFor(() => expect(within(api.getByTestId("stat-locations")).getByText("7")).toBeTruthy())

      await act(async () => {
        releaseSlow(stats({ total: 12480 }))
      })

      expect(within(api.getByTestId("stat-locations")).getByText("7")).toBeTruthy()
    })

    // Both presses land before React commits the busy state, so the disabled prop cannot stop the
    // second one. Only the ref can, which is why the guard is a ref.
    it("cannot arm two confirmations from two presses inside one render", async () => {
      mockShowConfirm.mockReturnValue(new Promise(() => {}))
      const api = renderScreen()
      await api.findByText("12,480")

      act(() => {
        fireEvent.press(api.getByTestId("delete-all-btn"))
        fireEvent.press(api.getByTestId("delete-synced-row"))
      })

      await waitFor(() => expect(mockGetStats).toHaveBeenCalled())
      expect(mockShowConfirm).toHaveBeenCalledTimes(1)
    })

    it("says so when the fresh count comes back empty instead of doing nothing", async () => {
      mockGetStats.mockResolvedValue(stats())
      const api = renderScreen()
      await api.findByText("12,480")
      mockGetStats.mockResolvedValue(stats({ sent: 0 }))

      fireEvent.press(api.getByTestId("delete-synced-row"))

      await waitFor(() =>
        expect(mockShowAlert).toHaveBeenCalledWith(
          "Nothing to delete",
          "That count came back empty. The figures above are current.",
          "info"
        )
      )
      expect(mockShowConfirm).not.toHaveBeenCalled()
    })
  })

  describe("compact", () => {
    it("says it deletes nothing and that the deletes already do this", async () => {
      const api = renderScreen()

      expect(
        await api.findByText(
          "Rewrites the database to give unused space back. Deleting trips and points leaves gaps that only this reclaims. Nothing is deleted."
        )
      ).toBeTruthy()
    })

    it("measures both sizes at the same moment, and says nothing rather than claiming a non-event", async () => {
      mockGetStats.mockResolvedValue(stats({ databaseSizeMB: 3.42 }))
      const api = renderScreen()
      await api.findByText("12,480")

      fireEvent.press(api.getByTestId("compact-btn"))

      expect(await api.findByText("Nothing to release")).toBeTruthy()
    })

    it("reports what a real compaction released", async () => {
      const api = renderScreen()
      await api.findByText("12,480")

      // Queued only once the mount read has landed, so the sizes pair with the two reads compact takes.
      mockGetStats.mockResolvedValueOnce(stats()).mockResolvedValue(stats({ databaseSizeMB: 3.0 }))
      fireEvent.press(api.getByTestId("compact-btn"))

      expect(await api.findByText(/^Released 0\.4\d MB$/)).toBeTruthy()
    })
  })

  it("offers no delete on an empty database and keeps the ledger and Compact", async () => {
    mockGetStats.mockResolvedValue(stats({ total: 0, sent: 0, queued: 0, databaseSizeMB: 0.02 }))
    const api = renderScreen()

    expect(await api.findByText("Nothing stored")).toBeTruthy()
    expect(api.queryByTestId("delete-all-btn")).toBeNull()
    expect(api.getByText("0.02 MB")).toBeTruthy()
    expect(api.getByTestId("compact-btn")).toBeTruthy()
  })
})
