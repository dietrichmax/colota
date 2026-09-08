import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Share } from "react-native"
import { lightColors } from "@colota/shared"
import { TrackingProfile } from "../../types/global"

const mockProfiles: TrackingProfile[] = [
  {
    id: 2,
    name: "Driving",
    interval: 2,
    distance: 10,
    syncInterval: 60,
    priority: 20,
    condition: { type: "speed_above", speedThreshold: 13.89 },
    activationDelay: 15,
    deactivationDelay: 30,
    enabled: true
  },
  {
    id: 1,
    name: "Commute",
    interval: 5,
    distance: 0,
    syncInterval: 0,
    priority: 10,
    condition: { type: "charging" },
    activationDelay: 0,
    deactivationDelay: 60,
    enabled: false
  }
]

const mockGetProfiles = jest.fn().mockResolvedValue(mockProfiles)
const mockUpdateProfile = jest.fn().mockResolvedValue(true)

jest.mock("../../services/ProfileService", () => ({
  ProfileService: {
    getProfiles: () => mockGetProfiles(),
    updateProfile: (update: any) => mockUpdateProfile(update)
  }
}))

const mockShowAlert = jest.fn()
jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args)
}))

let mockActiveProfileId: number | null = null
let mockTracking = true
jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    activeProfileId: mockActiveProfileId,
    tracking: mockTracking,
    settings: { isOfflineMode: false, interval: 30, distance: 2, syncInterval: 300 }
  })
}))

jest.mock("../../hooks/useActiveProfile", () => ({
  useActiveProfile: (id: number | null) => (id === null ? null : (mockProfiles.find((p) => p.id === id) ?? null))
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: jest.requireActual("@colota/shared").lightColors })
}))

jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  shortDistanceUnit: () => "m",
  metersToInput: (v: number) => v,
  getSpeedUnit: () => ({ factor: 3.6, unit: "km/h" }),
  speedToInput: (mps: number) => Math.round(mps * 3.6)
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    EmptyState: ({ title, hint, action }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, title),
        R.createElement(Text, null, hint),
        action &&
          R.createElement(
            Pressable,
            { testID: "empty-action", onPress: action.onPress },
            R.createElement(Text, null, action.label)
          )
      ),
    HeaderAction: ({ label, onPress, testID }: any) =>
      R.createElement(Pressable, { testID, onPress, accessibilityRole: "button", accessibilityLabel: label }),
    Toggle: function (props: any) {
      return R.createElement(require("react-native").Switch, {
        testID: props.testID,
        value: props.value,
        onValueChange: props.onValueChange,
        accessibilityLabel: props.accessibilityLabel
      })
    },
    ListItem: ({ label, sub, onPress, testID, icon, iconColor, trailing }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(
          Pressable,
          { testID, onPress, accessibilityRole: "button", accessibilityLabel: `${label}, ${sub}` },
          R.createElement(Text, null, label),
          R.createElement(Text, null, sub),
          R.createElement(Text, { testID: `${testID}-glyph`, style: { color: iconColor } }, icon?.displayName ?? "icon")
        ),
        trailing
      ),
    StateLine: ({ label, caption, iconColor, testID }: any) =>
      R.createElement(
        View,
        { testID, accessibilityValue: { text: iconColor } },
        R.createElement(Text, null, label),
        R.createElement(Text, null, caption)
      ),
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, { testID: "profiles-card" }, children),
    Divider: () => R.createElement(View, null)
  }
})

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn() } }))

import { TrackingProfilesScreen } from "../TrackingProfilesScreen"

const mockNavigate = jest.fn()
const mockAddListener = jest.fn().mockReturnValue(jest.fn())
const mockSetOptions = jest.fn()
const mockNavigation = { navigate: mockNavigate, addListener: mockAddListener, setOptions: mockSetOptions }
const headerRight = () => render(mockSetOptions.mock.calls.at(-1)[0].headerRight())

describe("TrackingProfilesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockActiveProfileId = null
    mockTracking = true
    mockGetProfiles.mockResolvedValue(mockProfiles)
  })

  function renderScreen() {
    return render(<TrackingProfilesScreen navigation={mockNavigation as any} />)
  }

  describe("the state line", () => {
    it("names the profile in force with its values and tints its glyph", async () => {
      mockActiveProfileId = 2
      const { findByText, getByText, getByTestId } = renderScreen()

      expect(await findByText("Driving is active")).toBeTruthy()
      expect(getByText("In force: every 2 s after 10 m · syncs every 1 min")).toBeTruthy()
      expect(getByTestId("profile-state").props.accessibilityValue.text).toBe(lightColors.success)
    })

    it("gives the default a meaning while tracking runs with no profile", async () => {
      const { findByText, getByText } = renderScreen()

      expect(await findByText("No profile active")).toBeTruthy()
      expect(getByText("Tracking & sync applies: every 30 s after 2 m · syncs every 5 min")).toBeTruthy()
    })

    it("says profiles wait for tracking instead of inventing a state", async () => {
      mockTracking = false
      mockActiveProfileId = 2
      const { findByText, queryByText } = renderScreen()

      expect(await findByText("Profiles apply while tracking runs")).toBeTruthy()
      expect(queryByText(/^Active · /)).toBeNull()
    })
  })

  describe("the rows", () => {
    it("reads each profile as a sentence in priority order, with its switch", async () => {
      const { findByText, getByText, getByTestId } = renderScreen()

      expect(await findByText("Speed above 50 km/h · Every 2 s after 10 m · syncs every 1 min")).toBeTruthy()
      expect(getByText("When charging · Every 5 s, any movement · syncs each fix")).toBeTruthy()
      expect(getByTestId("profile-toggle-2").props.value).toBe(true)
      expect(getByTestId("profile-toggle-1").props.value).toBe(false)
      expect(getByTestId("profile-toggle-1").props.accessibilityLabel).toBe("Use Commute")
    })

    it("opens the row in force with Active and tints its glyph, and no other", async () => {
      mockActiveProfileId = 2
      const { findByText, getByTestId, queryByText } = renderScreen()

      expect(await findByText("Active · speed above 50 km/h · Every 2 s after 10 m · syncs every 1 min")).toBeTruthy()
      expect(getByTestId("profile-2-glyph").props.style.color).toBe(lightColors.success)
      expect(getByTestId("profile-1-glyph").props.style.color).toBeUndefined()
      expect(queryByText(/Active · when charging/)).toBeNull()
    })

    it("opens the editor from the row body", async () => {
      const { findByTestId } = renderScreen()

      fireEvent.press(await findByTestId("profile-1"))

      expect(mockNavigate).toHaveBeenCalledWith("Profile Editor", { profileId: 1 })
    })

    it("flips a profile's switch and reloads, and says when that fails", async () => {
      const { findByTestId } = renderScreen()

      fireEvent(await findByTestId("profile-toggle-1"), "valueChange", true)

      await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({ id: 1, enabled: true }))
      expect(mockGetProfiles).toHaveBeenCalledTimes(2)

      mockUpdateProfile.mockRejectedValueOnce(new Error("db"))
      fireEvent(await findByTestId("profile-toggle-2"), "valueChange", false)
      await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to update profile.", "error"))
    })

    it("reloads on focus, so an edit shows on the way back", () => {
      renderScreen()
      expect(mockAddListener).toHaveBeenCalledWith("focus", expect.any(Function))
    })
  })

  describe("the app bar", () => {
    it("holds Share before Create, and Share only with profiles", async () => {
      const { findByTestId } = renderScreen()
      await findByTestId("profile-1")

      const bar = headerRight()
      expect(bar.getByLabelText("Share all profiles")).toBeTruthy()
      expect(bar.getByLabelText("Create profile")).toBeTruthy()

      mockGetProfiles.mockResolvedValue([])
      const empty = renderScreen()
      await empty.findByText("No profiles yet")
      expect(headerRight().queryByLabelText("Share all profiles")).toBeNull()
    })

    it("shares a setup link with every profile and no database fields", async () => {
      const shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined })
      const { findByTestId } = renderScreen()
      await findByTestId("profile-1")

      fireEvent.press(headerRight().getByLabelText("Share all profiles"))

      await waitFor(() => expect(shareSpy).toHaveBeenCalledWith({ message: expect.stringContaining("colota://setup") }))
      const link: string = shareSpy.mock.calls[0][0].message as string
      expect(decodeURIComponent(link.split("config=")[1])).not.toMatch(/"id"/)
      shareSpy.mockRestore()
    })

    it("opens the editor on an empty draft from Create", async () => {
      const { findByTestId } = renderScreen()
      await findByTestId("profile-1")

      fireEvent.press(headerRight().getByLabelText("Create profile"))

      expect(mockNavigate).toHaveBeenCalledWith("Profile Editor", {})
    })
  })

  it("shows the empty state with one action and no card or caption", async () => {
    mockGetProfiles.mockResolvedValue([])
    const { findByText, queryByTestId, queryByText, getByTestId } = renderScreen()

    expect(await findByText("No profiles yet")).toBeTruthy()
    expect(queryByTestId("profiles-card")).toBeNull()
    expect(queryByText(/Checked top to bottom/)).toBeNull()
    fireEvent.press(getByTestId("empty-action"))
    expect(mockNavigate).toHaveBeenCalledWith("Profile Editor", {})
  })
})
