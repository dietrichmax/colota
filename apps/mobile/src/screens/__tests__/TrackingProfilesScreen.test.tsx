import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Share } from "react-native"
import { TrackingProfile } from "../../types/global"

// --- Mocks ---

const mockProfiles: TrackingProfile[] = [
  {
    id: 1,
    name: "Charging",
    interval: 10,
    distance: 0,
    syncInterval: 0,
    priority: 10,
    condition: { type: "charging" },
    activationDelay: 0,
    deactivationDelay: 60,
    enabled: true
  },
  {
    id: 2,
    name: "Driving",
    interval: 3,
    distance: 5,
    syncInterval: 60,
    priority: 20,
    condition: { type: "speed_above", speedThreshold: 13.89 },
    activationDelay: 15,
    deactivationDelay: 30,
    enabled: false
  }
]

const mockGetProfiles = jest.fn().mockResolvedValue(mockProfiles)
const mockUpdateProfile = jest.fn().mockResolvedValue(true)
const mockDeleteProfile = jest.fn().mockResolvedValue(true)

jest.mock("../../services/ProfileService", () => ({
  ProfileService: {
    getProfiles: () => mockGetProfiles(),
    updateProfile: (update: any) => mockUpdateProfile(update),
    deleteProfile: (id: number) => mockDeleteProfile(id)
  }
}))

const mockShowAlert = jest.fn()
const mockShowConfirm = jest.fn().mockResolvedValue(true)

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args),
  showConfirm: (...args: any[]) => mockShowConfirm(...args)
}))

let mockActiveProfileName: string | null = null

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    activeProfileName: mockActiveProfileName,
    settings: { isOfflineMode: false }
  })
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors
  })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Toggle: ({ value, onValueChange, disabled, testID, accessibilityLabel }: any) =>
      R.createElement(Pressable, {
        testID,
        disabled,
        accessibilityRole: "switch",
        accessibilityLabel,
        accessibilityState: { checked: value, disabled: !!disabled },
        onPress: () => onValueChange(!value)
      }),
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children, action }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, children),
        action
          ? R.createElement(
              Pressable,
              { testID: action.testID, onPress: action.onPress },
              R.createElement(Text, null, action.label)
            )
          : null
      ),
    Button: ({ title, onPress, testID }: any) =>
      R.createElement(Pressable, { testID, onPress }, R.createElement(Text, null, title)),
    EmptyState: ({ title, message }: any) =>
      R.createElement(View, null, R.createElement(Text, null, title), R.createElement(Text, null, message)),
    ListItem: ({ testID, label, sub, style, onPress, trailing }: any) =>
      R.createElement(
        View,
        { style },
        R.createElement(
          Pressable,
          { testID, onPress },
          R.createElement(Text, null, label),
          sub ? R.createElement(Text, null, sub) : null
        ),
        trailing
      )
  }
})

const mockNavigate = jest.fn()
const mockAddListener = jest.fn().mockReturnValue(jest.fn())

const mockNavigation = {
  navigate: mockNavigate,
  addListener: mockAddListener
}

import { TrackingProfilesScreen } from "../TrackingProfilesScreen"

describe("TrackingProfilesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockActiveProfileName = null
    mockGetProfiles.mockResolvedValue(mockProfiles)
    mockShowConfirm.mockResolvedValue(true)
  })

  function renderScreen() {
    return render(<TrackingProfilesScreen navigation={mockNavigation as any} />)
  }

  it("renders profile list", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Charging")).toBeTruthy()
      expect(getByText("Driving")).toBeTruthy()
    })
  })

  it("shows profile condition text", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText(/When charging/)).toBeTruthy()
      expect(getByText(/Speed above 50 km\/h/)).toBeTruthy()
    })
  })

  it("shows profile settings summary", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText(/10s interval/)).toBeTruthy()
      expect(getByText(/3s interval/)).toBeTruthy()
    })
  })

  // Priority decides which profile wins when two match at once, so it stays visible
  // once the tinted badge is gone.
  it("keeps the priority in the row's sub line", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText(/^P10 /)).toBeTruthy()
      expect(getByText(/^P20 /)).toBeTruthy()
    })
  })

  it("shows empty state when no profiles", async () => {
    mockGetProfiles.mockResolvedValue([])

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("No profiles yet")).toBeTruthy()
    })
  })

  it("navigates to editor when pressing Create profile", async () => {
    const { getByTestId, getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Create profile")).toBeTruthy()
    })

    fireEvent.press(getByTestId("create-profile-btn"))

    expect(mockNavigate).toHaveBeenCalledWith("Profile Editor", {})
  })

  it("navigates to editor with profileId when pressing a profile", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Charging")).toBeTruthy()
    })

    fireEvent.press(getByText("Charging"))

    expect(mockNavigate).toHaveBeenCalledWith("Profile Editor", { profileId: 1 })
  })

  it("shows confirmation dialog before deleting", async () => {
    const { getByText, getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByText("Charging")).toBeTruthy()
    })

    fireEvent.press(getByTestId("delete-profile-1"))

    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Delete profile" }))
    })

    await waitFor(() => {
      expect(mockDeleteProfile).toHaveBeenCalledWith(1)
    })
  })

  it("shows section title with profile count", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("2 profiles")).toBeTruthy()
    })
  })

  it("shows error when toggle fails", async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error("Network error"))

    const { getByText, getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByText("Driving")).toBeTruthy()
    })

    fireEvent.press(getByTestId("toggle-profile-2"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Error", expect.any(String), "error")
    })
  })

  it("reloads profiles on focus", () => {
    renderScreen()

    // Verify navigation focus listener is registered
    expect(mockAddListener).toHaveBeenCalledWith("focus", expect.any(Function))
  })

  // The tinted badge is gone: the active profile is marked by the container fill on the
  // row plus the word in its sub line, so state never rides on colour alone.
  it("names the active profile in its sub line and fills the row", async () => {
    mockActiveProfileName = "Charging"

    const { getByText, getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByText(/^Active /)).toBeTruthy()
    })

    expect(getByTestId("toggle-profile-1")).toBeTruthy()
  })

  it("marks no profile active when the context reports none", async () => {
    mockActiveProfileName = null

    const { queryByText, getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Charging")).toBeTruthy()
    })
    expect(queryByText(/^Active /)).toBeNull()
  })

  describe("share profiles", () => {
    let shareSpy: jest.SpyInstance

    beforeEach(() => {
      shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined })
    })

    afterEach(() => {
      shareSpy.mockRestore()
    })

    it("does not render the share button when there are no profiles", async () => {
      mockGetProfiles.mockResolvedValue([])
      const { queryByTestId, getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("No profiles yet")).toBeTruthy()
      })

      expect(queryByTestId("share-profiles-btn")).toBeNull()
    })

    it("renders the share button when at least one profile exists", async () => {
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-profiles-btn")).toBeTruthy()
      })
    })

    it("opens the share sheet with a colota://setup link on press", async () => {
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-profiles-btn")).toBeTruthy()
      })

      fireEvent.press(getByTestId("share-profiles-btn"))

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledTimes(1)
      })

      const arg = shareSpy.mock.calls[0][0]
      expect(arg.message).toMatch(/^colota:\/\/setup\?config=/)
    })

    it("encodes profiles without id or createdAt fields", async () => {
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-profiles-btn")).toBeTruthy()
      })

      fireEvent.press(getByTestId("share-profiles-btn"))

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledTimes(1)
      })

      const link = shareSpy.mock.calls[0][0].message as string
      const encoded = link.split("config=")[1]
      const decoded = JSON.parse(atob(encoded))

      expect(decoded.profiles).toHaveLength(2)
      expect(decoded.profiles[0]).not.toHaveProperty("id")
      expect(decoded.profiles[0]).not.toHaveProperty("createdAt")
      expect(decoded.profiles[0]).toEqual({
        name: "Charging",
        interval: 10,
        distance: 0,
        syncInterval: 0,
        priority: 10,
        condition: { type: "charging" },
        activationDelay: 0,
        deactivationDelay: 60,
        enabled: true
      })
      expect(decoded.profiles[1].condition).toEqual({ type: "speed_above", speedThreshold: 13.89 })
    })

    it("shows an error alert when sharing fails", async () => {
      shareSpy.mockRejectedValueOnce(new Error("share failed"))

      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-profiles-btn")).toBeTruthy()
      })

      fireEvent.press(getByTestId("share-profiles-btn"))

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to share profiles.", "error")
      })
    })
  })
})
