import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
const mockSetSettings = jest.fn()
const mockUpdateSettingsLocal = jest.fn()
const mockRestartTracking = jest.fn()
let mockActiveProfileId: number | null = null

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: require("../../types/global").DEFAULT_SETTINGS,
    setSettings: mockSetSettings,
    updateSettingsLocal: mockUpdateSettingsLocal,
    restartTracking: mockRestartTracking,
    activeProfileId: mockActiveProfileId
  })
}))

const mockDebouncedSaveAndRestart = jest.fn()
const mockImmediateSaveAndRestart = jest.fn()
jest.mock("../../hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    saving: false,
    message: null,
    isError: false,
    debouncedSaveAndRestart: mockDebouncedSaveAndRestart,
    immediateSaveAndRestart: mockImmediateSaveAndRestart
  })
}))

const mockGetProfiles = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getProfiles: (...args: unknown[]) => mockGetProfiles(...args)
  }
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn() } }))

jest.mock("../../components", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { Container: ({ children }: any) => R.createElement(View, null, children) }
})

jest.mock("../../components/ui/FloatingSaveIndicator", () => ({ FloatingSaveIndicator: () => null }))

jest.mock("../../components/features/settings/SyncStrategySettings", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  const { DEFAULT_SETTINGS: base } = require("../../types/global")
  return {
    SyncStrategySettings: ({ onSettingsChange, onDebouncedSave, onImmediateSave, activeProfile }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, activeProfile ? `${activeProfile.name} is active` : "no profile"),
        R.createElement(Pressable, {
          testID: "type",
          onPress: () => {
            const next = { ...base, interval: 20 }
            onSettingsChange(next)
            onDebouncedSave(next)
          }
        }),
        R.createElement(Pressable, {
          testID: "preset",
          onPress: () => onImmediateSave({ ...base, syncPreset: "balanced" })
        })
      )
  }
})

import { TrackingSyncScreen } from "../TrackingSyncScreen"

const mockProps = { navigation: {} as any, route: { params: undefined } as any }

beforeEach(() => {
  jest.clearAllMocks()
  mockActiveProfileId = null
  mockGetProfiles.mockResolvedValue([{ id: 4, name: "Charging", interval: 5, distance: 20, syncInterval: 900 }])
})

describe("TrackingSyncScreen", () => {
  it("wires a typed edit to local state first, then the debounced save that restarts tracking", () => {
    const { getByTestId } = render(<TrackingSyncScreen {...mockProps} />)

    fireEvent.press(getByTestId("type"))

    expect(mockUpdateSettingsLocal).toHaveBeenCalledWith(expect.objectContaining({ interval: 20 }))
    expect(mockDebouncedSaveAndRestart).toHaveBeenCalledTimes(1)
    const [save, restart] = mockDebouncedSaveAndRestart.mock.calls[0]
    save()
    restart()
    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({ interval: 20 }))
    expect(mockRestartTracking).toHaveBeenCalledWith(expect.objectContaining({ interval: 20 }))
  })

  it("wires a discrete choice to the immediate save", () => {
    const { getByTestId } = render(<TrackingSyncScreen {...mockProps} />)

    fireEvent.press(getByTestId("preset"))

    expect(mockImmediateSaveAndRestart).toHaveBeenCalledTimes(1)
    const [save] = mockImmediateSaveAndRestart.mock.calls[0]
    save()
    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({ syncPreset: "balanced" }))
  })

  it("resolves the active profile so the groups it overrides can show the values in force", async () => {
    mockActiveProfileId = 4
    const { findByText } = render(<TrackingSyncScreen {...mockProps} />)

    expect(await findByText("Charging is active")).toBeTruthy()
  })

  it("hands over no profile while none is active", async () => {
    const { getByText } = render(<TrackingSyncScreen {...mockProps} />)

    await waitFor(() => expect(getByText("no profile")).toBeTruthy())
    expect(mockGetProfiles).not.toHaveBeenCalled()
  })
})
