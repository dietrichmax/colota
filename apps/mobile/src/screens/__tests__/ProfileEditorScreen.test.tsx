import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { TrackingProfile } from "../../types/global"

// --- Mocks ---

const mockProfiles: TrackingProfile[] = [
  {
    id: 1,
    name: "Existing Profile",
    interval: 10,
    distance: 5,
    syncInterval: 60,
    priority: 15,
    condition: { type: "speed_above", speedThreshold: 13.89 },
    deactivationDelay: 30,
    enabled: true
  }
]

const mockGetProfiles = jest.fn().mockResolvedValue(mockProfiles)
const mockCreateProfile = jest.fn().mockResolvedValue(1)
const mockUpdateProfile = jest.fn().mockResolvedValue(true)

jest.mock("../../services/ProfileService", () => ({
  ProfileService: {
    getProfiles: () => mockGetProfiles(),
    createProfile: (p: any) => mockCreateProfile(p),
    updateProfile: (p: any) => mockUpdateProfile(p)
  }
}))

const mockShowAlert = jest.fn()

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args)
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      info: "#3b82f6",
      success: "#22c55e",
      error: "#ef4444",
      card: "#fff",
      backgroundElevated: "#f9fafb",
      placeholder: "#9ca3af",
      textOnPrimary: "#fff"
    }
  })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null)
  }
})

const mockGoBack = jest.fn()

const mockNavigation = {
  goBack: mockGoBack
}

import { ProfileEditorScreen } from "../ProfileEditorScreen"

describe("ProfileEditorScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetProfiles.mockResolvedValue(mockProfiles)
  })

  function renderNewProfile() {
    return render(<ProfileEditorScreen navigation={mockNavigation as any} route={{ params: {} }} />)
  }

  function renderEditProfile(profileId = 1) {
    return render(<ProfileEditorScreen navigation={mockNavigation as any} route={{ params: { profileId } }} />)
  }

  // --- New Profile Mode ---

  it("renders new profile title", () => {
    const { getByText } = renderNewProfile()
    expect(getByText("New Profile")).toBeTruthy()
  })

  it("shows Create Profile button for new profile", () => {
    const { getByText } = renderNewProfile()
    expect(getByText("Create Profile")).toBeTruthy()
  })

  it("shows all condition options", () => {
    const { getByText } = renderNewProfile()

    expect(getByText("Charging")).toBeTruthy()
    expect(getByText("Car Mode")).toBeTruthy()
    expect(getByText("Speed Above")).toBeTruthy()
    expect(getByText("Speed Below")).toBeTruthy()
  })

  it("shows all sync interval options", () => {
    const { getByText } = renderNewProfile()

    expect(getByText("Instant")).toBeTruthy()
    expect(getByText("1 min")).toBeTruthy()
    expect(getByText("5 min")).toBeTruthy()
    expect(getByText("15 min")).toBeTruthy()
  })

  // --- Validation ---

  it("shows alert when saving with empty name", async () => {
    const { getByText } = renderNewProfile()

    fireEvent.press(getByText("Create Profile"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Missing Name", "Please enter a profile name.", "warning")
    })
  })

  it("allows setting interval to valid value", () => {
    const { getByDisplayValue } = renderNewProfile()

    const intervalInput = getByDisplayValue("5")
    fireEvent.changeText(intervalInput, "15")

    expect(getByDisplayValue("15")).toBeTruthy()
  })

  it("saves with speed condition when threshold is valid", async () => {
    const { getByText, getByDisplayValue } = renderNewProfile()

    const nameInput = getByDisplayValue("")
    fireEvent.changeText(nameInput, "Speed Test")

    // Select speed_above condition — defaults to 30 km/h threshold
    fireEvent.press(getByText("Speed Above"))

    fireEvent.press(getByText("Create Profile"))

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalled()
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  // --- Successful save ---

  it("creates profile and navigates back on valid save", async () => {
    const { getByText, getByDisplayValue } = renderNewProfile()

    const nameInput = getByDisplayValue("")
    fireEvent.changeText(nameInput, "My Profile")

    fireEvent.press(getByText("Create Profile"))

    await waitFor(() => {
      expect(mockCreateProfile).toHaveBeenCalled()
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it("does not call createProfile when validation fails", async () => {
    const { getByText } = renderNewProfile()

    // Try to save with empty name
    fireEvent.press(getByText("Create Profile"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalled()
    })

    expect(mockCreateProfile).not.toHaveBeenCalled()
  })

  // --- Edit Mode ---

  it("renders edit profile title when editing", async () => {
    const { getByText } = renderEditProfile()

    await waitFor(() => {
      expect(getByText("Edit Profile")).toBeTruthy()
    })
  })

  it("shows Save Changes button when editing", async () => {
    const { getByText } = renderEditProfile()

    await waitFor(() => {
      expect(getByText("Save Changes")).toBeTruthy()
    })
  })

  it("loads existing profile data", async () => {
    const { getByDisplayValue } = renderEditProfile()

    await waitFor(() => {
      expect(getByDisplayValue("Existing Profile")).toBeTruthy()
      expect(getByDisplayValue("15")).toBeTruthy() // priority
      expect(getByDisplayValue("10")).toBeTruthy() // interval
    })
  })

  it("loads speed threshold in km/h", async () => {
    const { getByDisplayValue } = renderEditProfile()

    // 13.89 m/s * 3.6 = 50 km/h
    await waitFor(() => {
      expect(getByDisplayValue("50")).toBeTruthy()
    })
  })

  it("calls updateProfile when saving in edit mode", async () => {
    const { getByText } = renderEditProfile()

    await waitFor(() => {
      expect(getByText("Save Changes")).toBeTruthy()
    })

    fireEvent.press(getByText("Save Changes"))

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalled()
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it("shows error and navigates back on load failure", async () => {
    mockGetProfiles.mockRejectedValueOnce(new Error("DB Error"))

    renderEditProfile()

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to load profile data.", "error")
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it("shows error when save fails", async () => {
    mockCreateProfile.mockRejectedValueOnce(new Error("Save failed"))

    const { getByText, getByDisplayValue } = renderNewProfile()

    const nameInput = getByDisplayValue("")
    fireEvent.changeText(nameInput, "Fail Profile")

    fireEvent.press(getByText("Create Profile"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to save profile.", "error")
    })
  })

  // --- Speed condition visibility ---

  it("shows speed threshold input only for speed conditions", () => {
    const { getByText, queryByText } = renderNewProfile()

    // Default is charging — no speed input
    expect(queryByText("Speed Threshold (km/h)")).toBeNull()

    // Select Speed Above
    fireEvent.press(getByText("Speed Above"))
    expect(getByText("Speed Threshold (km/h)")).toBeTruthy()

    // Switch back to charging
    fireEvent.press(getByText("Charging"))
    expect(queryByText("Speed Threshold (km/h)")).toBeNull()
  })

  // --- Numeric input ---

  it("updates interval via numeric input", () => {
    const { getByDisplayValue } = renderNewProfile()

    const intervalInput = getByDisplayValue("5")
    fireEvent.changeText(intervalInput, "15")

    expect(getByDisplayValue("15")).toBeTruthy()
  })

  it("updates priority via numeric input", () => {
    const { getByDisplayValue } = renderNewProfile()

    const priorityInput = getByDisplayValue("10")
    fireEvent.changeText(priorityInput, "25")

    expect(getByDisplayValue("25")).toBeTruthy()
  })
})
