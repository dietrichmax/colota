/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { OfflineMapsScreen } from "../OfflineMapsScreen"

// --- MapLibre ---
jest.mock("@maplibre/maplibre-react-native", () => ({
  ShapeSource: () => null,
  FillLayer: () => null,
  LineLayer: () => null
}))

// --- Navigation ---
const mockNavigation = { navigate: jest.fn() }

// --- Focus hook: call immediately on mount ---
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: Function) => {
    const { useEffect } = require("react")
    useEffect(() => {
      const cleanup = cb()
      return cleanup
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  }
}))

// --- Theme ---
jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      border: "#e5e7eb",
      text: "#111",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      info: "#3b82f6",
      success: "#22c55e",
      error: "#ef4444",
      warning: "#f59e0b",
      card: "#fff",
      backgroundElevated: "#f9fafb",
      placeholder: "#9ca3af",
      textOnPrimary: "#fff",
      link: "#0d9488"
    }
  })
}))

// --- Tracking context ---
jest.mock("../../contexts/TrackingProvider", () => ({
  useCoords: () => ({ latitude: 52.52, longitude: 13.405 })
}))

// --- Modal service ---
const mockShowAlert = jest.fn()
const mockShowConfirm = jest.fn()

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args),
  showConfirm: (...args: any[]) => mockShowConfirm(...args)
}))

// --- Native service ---
const mockIsNetworkAvailable = jest.fn()
const mockIsUnmeteredConnection = jest.fn()
const mockGetAvailableStorageMB = jest.fn()

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    isNetworkAvailable: (...args: any[]) => mockIsNetworkAvailable(...args),
    isUnmeteredConnection: (...args: any[]) => mockIsUnmeteredConnection(...args),
    getAvailableStorageMB: (...args: any[]) => mockGetAvailableStorageMB(...args),
    getMostRecentLocation: jest.fn().mockResolvedValue(null),
    getSetting: jest.fn().mockResolvedValue(null)
  }
}))

// --- OfflinePackManager ---
const mockLoadOfflineAreas = jest.fn()
const mockLoadOfflineAreaBounds = jest.fn()
const mockCreateOfflinePack = jest.fn()
const mockDeleteOfflineArea = jest.fn()
const mockSaveOfflineAreaBounds = jest.fn()
const mockRemoveOfflineAreaBounds = jest.fn()
const mockEstimateSizeLabel = jest.fn()
const mockEstimateSizeBytes = jest.fn()
const mockWillExceedTileLimit = jest.fn()

jest.mock("../../components/features/map/OfflinePackManager", () => ({
  DOWNLOAD_STATE: { INACTIVE: 0, ACTIVE: 1, COMPLETE: 2, FAILED: 3 },
  formatBytes: jest.fn().mockReturnValue("5.0 MB"),
  loadOfflineAreas: (...args: any[]) => mockLoadOfflineAreas(...args),
  loadOfflineAreaBounds: (...args: any[]) => mockLoadOfflineAreaBounds(...args),
  createOfflinePack: (...args: any[]) => mockCreateOfflinePack(...args),
  deleteOfflineArea: (...args: any[]) => mockDeleteOfflineArea(...args),
  saveOfflineAreaBounds: (...args: any[]) => mockSaveOfflineAreaBounds(...args),
  removeOfflineAreaBounds: (...args: any[]) => mockRemoveOfflineAreaBounds(...args),
  unsubscribeOfflinePack: jest.fn(),
  estimateSizeLabel: (...args: any[]) => mockEstimateSizeLabel(...args),
  estimateSizeBytes: (...args: any[]) => mockEstimateSizeBytes(...args),
  willExceedTileLimit: (...args: any[]) => mockWillExceedTileLimit(...args)
}))

// --- ColotaMapView: fires onRegionDidChange on mount to supply bounds ---
jest.mock("../../components/features/map/ColotaMapView", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    ColotaMapView: R.forwardRef(({ onRegionDidChange, children }: any, _ref: any) => {
      R.useEffect(() => {
        onRegionDidChange?.({
          isUserInteraction: false,
          visibleBounds: [
            [13.5, 52.6],
            [13.4, 52.5]
          ]
        })
      }, [])
      return R.createElement(View, { testID: "map-view" }, children)
    })
  }
})

// --- MapCenterButton ---
jest.mock("../../components/features/map/MapCenterButton", () => ({
  MapCenterButton: () => null
}))

// --- UI components ---
jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children, style }: any) => R.createElement(View, { style }, children)
  }
})

// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks()
  mockIsNetworkAvailable.mockResolvedValue(true)
  mockIsUnmeteredConnection.mockResolvedValue(true)
  mockGetAvailableStorageMB.mockResolvedValue(1000)
  mockLoadOfflineAreas.mockResolvedValue([])
  mockLoadOfflineAreaBounds.mockResolvedValue([])
  mockSaveOfflineAreaBounds.mockResolvedValue(undefined)
  mockRemoveOfflineAreaBounds.mockResolvedValue(undefined)
  mockDeleteOfflineArea.mockResolvedValue(undefined)
  mockEstimateSizeLabel.mockReturnValue("~5 MB")
  mockEstimateSizeBytes.mockReturnValue(5 * 1024 * 1024)
  mockWillExceedTileLimit.mockReturnValue(false)
  mockCreateOfflinePack.mockResolvedValue(undefined)
  mockShowConfirm.mockResolvedValue(false)
})

function renderScreen() {
  return render(<OfflineMapsScreen navigation={mockNavigation as any} />)
}

// Waits for map bounds to be set and the estimate label to appear
async function waitForMapReady(findByText: ReturnType<typeof render>["findByText"]) {
  return findByText("~5 MB estimated")
}

// ---------------------------------------------------------------------------

describe("OfflineMapsScreen", () => {
  it("renders the name input and download button", async () => {
    const { getByPlaceholderText, findByText, getByTestId } = renderScreen()
    await waitForMapReady(findByText)
    expect(getByPlaceholderText("Home area, Trail...")).toBeTruthy()
    expect(getByTestId("download-btn")).toBeTruthy()
  })

  it("shows 'Missing Name' alert when downloading with empty name", async () => {
    const { findByText, getByTestId } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.press(getByTestId("download-btn"))
    expect(mockShowAlert).toHaveBeenCalledWith("Missing Name", expect.any(String), "warning")
  })

  it("shows 'Offline' alert when downloading while offline", async () => {
    mockIsNetworkAvailable.mockResolvedValue(false)
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "my area")
    fireEvent.press(getByTestId("download-btn"))
    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Offline", expect.any(String), "warning")
    })
  })

  it("shows 'Duplicate Name' alert when name matches an existing area", async () => {
    mockLoadOfflineAreas.mockResolvedValue([{ name: "home", sizeBytes: 1024, isComplete: true, isActive: false }])
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "home")
    fireEvent.press(getByTestId("download-btn"))
    expect(mockShowAlert).toHaveBeenCalledWith("Duplicate Name", expect.any(String), "warning")
  })

  it("shows mobile data confirm dialog when not on WiFi before downloading", async () => {
    mockIsUnmeteredConnection.mockResolvedValue(false)
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "my area")
    fireEvent.press(getByTestId("download-btn"))
    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Mobile Data" }))
    })
  })

  it("aborts download when user cancels the mobile data warning", async () => {
    mockIsUnmeteredConnection.mockResolvedValue(false)
    mockShowConfirm.mockResolvedValue(false)
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "my area")
    fireEvent.press(getByTestId("download-btn"))
    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Mobile Data" }))
      expect(mockCreateOfflinePack).not.toHaveBeenCalled()
    })
  })

  it("shows 'Storage Full' alert when estimated size exceeds available storage", async () => {
    mockGetAvailableStorageMB.mockResolvedValue(1)
    mockEstimateSizeBytes.mockReturnValue(10 * 1024 * 1024)
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "big area")
    fireEvent.press(getByTestId("download-btn"))
    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Storage Full", expect.any(String), "warning")
    })
  })

  it("calls createOfflinePack with correct args when user confirms download", async () => {
    mockShowConfirm.mockResolvedValue(true)
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "new area")
    fireEvent.press(getByTestId("download-btn"))
    await waitFor(() => {
      expect(mockCreateOfflinePack).toHaveBeenCalledWith(
        "new area",
        expect.any(Array),
        expect.any(Array),
        expect.any(Function),
        expect.any(Function)
      )
    })
  })

  it("does not call createOfflinePack when user cancels the confirmation", async () => {
    mockShowConfirm.mockResolvedValue(false)
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "new area")
    fireEvent.press(getByTestId("download-btn"))
    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalled()
      expect(mockCreateOfflinePack).not.toHaveBeenCalled()
    })
  })

  it("cancels an in-flight download and deletes the partial pack", async () => {
    mockShowConfirm.mockResolvedValue(true)
    mockCreateOfflinePack.mockReturnValue(new Promise(() => {})) // never resolves - simulates active download
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "my area")
    fireEvent.press(getByTestId("download-btn"))
    fireEvent.press(await findByText("Cancel Download"))
    await waitFor(() => {
      expect(mockDeleteOfflineArea).toHaveBeenCalledWith("my area")
      expect(mockRemoveOfflineAreaBounds).toHaveBeenCalledWith("my area")
    })
  })

  it("shows saved areas loaded on mount", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      { name: "forest trail", sizeBytes: 5_000_000, isComplete: true, isActive: false }
    ])
    const { findByText } = renderScreen()
    await findByText("forest trail")
  })

  it("shows size for a saved area", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      { name: "my park", sizeBytes: 2_000_000, isComplete: true, isActive: false }
    ])
    const { findByText } = renderScreen()
    await findByText("5.0 MB")
  })

  it("shows stale indicator when style URL has changed", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      { name: "old area", sizeBytes: 1_000_000, isComplete: true, isActive: false }
    ])
    mockLoadOfflineAreaBounds.mockResolvedValue([
      { name: "old area", ne: [13.5, 52.6], sw: [13.4, 52.5], styleUrl: "https://old.server/style.json" }
    ])
    // getSetting returns a different URL only for the style key
    const NativeService = require("../../services/NativeLocationService").default
    NativeService.getSetting.mockImplementation((key: string) =>
      key === "mapStyleUrlLight" ? Promise.resolve("https://new.server/style.json") : Promise.resolve(null)
    )
    const { findByTestId } = renderScreen()
    await findByTestId("stale-indicator-old area")
  })

  it("calls deleteOfflineArea and removeOfflineAreaBounds when user confirms delete", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      { name: "my park", sizeBytes: 2_000_000, isComplete: true, isActive: false }
    ])
    mockShowConfirm.mockResolvedValue(true)
    const { findByText, getByTestId } = renderScreen()
    await findByText("my park")
    fireEvent.press(getByTestId("delete-btn-my park"))
    await waitFor(() => {
      expect(mockDeleteOfflineArea).toHaveBeenCalledWith("my park")
      expect(mockRemoveOfflineAreaBounds).toHaveBeenCalledWith("my park")
    })
  })

  it("does not delete when user cancels the delete confirmation", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      { name: "my park", sizeBytes: 2_000_000, isComplete: true, isActive: false }
    ])
    mockShowConfirm.mockResolvedValue(false)
    const { findByText, getByTestId } = renderScreen()
    await findByText("my park")
    fireEvent.press(getByTestId("delete-btn-my park"))
    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalled()
      expect(mockDeleteOfflineArea).not.toHaveBeenCalled()
    })
  })

  it("calls deleteOfflineArea and createOfflinePack when user confirms re-download", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      { name: "existing area", sizeBytes: 5_000_000, isComplete: true, isActive: false }
    ])
    mockLoadOfflineAreaBounds.mockResolvedValue([
      {
        name: "existing area",
        ne: [13.5, 52.6],
        sw: [13.4, 52.5],
        styleUrl: "https://maps.mxd.codes/styles/bright/style.json"
      }
    ])
    mockShowConfirm.mockResolvedValue(true)
    mockDeleteOfflineArea.mockResolvedValue(undefined)
    const { findByText, getByTestId } = renderScreen()
    await findByText("existing area")
    fireEvent.press(getByTestId("refresh-btn-existing area"))
    await waitFor(() => {
      expect(mockDeleteOfflineArea).toHaveBeenCalledWith("existing area")
      expect(mockCreateOfflinePack).toHaveBeenCalledWith(
        "existing area",
        [13.5, 52.6],
        [13.4, 52.5],
        expect.any(Function),
        expect.any(Function)
      )
    })
  })

  it("does not re-download when user cancels refresh confirmation", async () => {
    mockLoadOfflineAreas.mockResolvedValue([
      { name: "existing area", sizeBytes: 5_000_000, isComplete: true, isActive: false }
    ])
    mockLoadOfflineAreaBounds.mockResolvedValue([
      {
        name: "existing area",
        ne: [13.5, 52.6],
        sw: [13.4, 52.5],
        styleUrl: "https://maps.mxd.codes/styles/bright/style.json"
      }
    ])
    mockShowConfirm.mockResolvedValue(false)
    const { findByText, getByTestId } = renderScreen()
    await findByText("existing area")
    fireEvent.press(getByTestId("refresh-btn-existing area"))
    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalled()
      expect(mockCreateOfflinePack).not.toHaveBeenCalled()
    })
  })

  it("shows tile limit warning in the confirmation when area is large", async () => {
    mockWillExceedTileLimit.mockReturnValue(true)
    mockShowConfirm.mockResolvedValue(false)
    const { findByText, getByTestId, getByPlaceholderText } = renderScreen()
    await waitForMapReady(findByText)
    fireEvent.changeText(getByPlaceholderText("Home area, Trail..."), "big area")
    fireEvent.press(getByTestId("download-btn"))
    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining("large") })
      )
    })
  })
})
