import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import i18next from "i18next"

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react")
    R.useEffect(() => {
      const cleanup = cb()
      return typeof cleanup === "function" ? cleanup : undefined
    }, [cb])
  }
}))

const mockGetAppLanguage = jest.fn()
const mockSetAppLanguage = jest.fn()
const mockShowAlert = jest.fn()

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getAppLanguage: () => mockGetAppLanguage(),
    setAppLanguage: (tag: string) => mockSetAppLanguage(tag)
  }
}))

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: unknown[]) => mockShowAlert(...args)
}))

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    RadioRow: ({ label, selected, onPress, disabled, testID }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, disabled, accessibilityState: { checked: selected, disabled } },
        R.createElement(Text, null, label)
      )
  }
})

import { LanguageScreen } from "../LanguageScreen"

describe("LanguageScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAppLanguage.mockResolvedValue({ picked: "", effective: "de-DE" })
    mockSetAppLanguage.mockResolvedValue("en-GB")
  })

  it("offers System default and every catalog, each language named in its own words", async () => {
    const { findByText, getByText } = render(<LanguageScreen navigation={{} as any} />)

    expect(await findByText("System default")).toBeTruthy()
    expect(getByText("English")).toBeTruthy()
  })

  // i18next has to switch too, or the screens keep the old language until the next cold start.
  it("stores a pick natively and switches the catalog at once", async () => {
    const change = jest.spyOn(i18next, "changeLanguage")
    const { getByTestId } = render(<LanguageScreen navigation={{} as any} />)
    await waitFor(() => expect(getByTestId("language-en").props.accessibilityState.disabled).toBe(false))

    fireEvent.press(getByTestId("language-en"))

    await waitFor(() => expect(mockSetAppLanguage).toHaveBeenCalledWith("en"))
    await waitFor(() => expect(change).toHaveBeenCalledWith("en"))
    expect(getByTestId("language-en").props.accessibilityState.checked).toBe(true)
    change.mockRestore()
  })

  it("sends an empty tag for System default and shows the phone's language, or English when there is no catalog for it", async () => {
    mockGetAppLanguage.mockResolvedValue({ picked: "en", effective: "en" })
    mockSetAppLanguage.mockResolvedValue("fr-FR")
    const change = jest.spyOn(i18next, "changeLanguage")
    const { getByTestId } = render(<LanguageScreen navigation={{} as any} />)
    await waitFor(() => expect(getByTestId("language-en").props.accessibilityState.checked).toBe(true))

    fireEvent.press(getByTestId("language-system"))

    await waitFor(() => expect(mockSetAppLanguage).toHaveBeenCalledWith(""))
    await waitFor(() => expect(change).toHaveBeenCalledWith("en"))
    change.mockRestore()
  })

  it("puts the previous choice back and says so when native refuses", async () => {
    mockSetAppLanguage.mockRejectedValue(new Error("nope"))
    const change = jest.spyOn(i18next, "changeLanguage")
    const { getByTestId } = render(<LanguageScreen navigation={{} as any} />)
    await waitFor(() => expect(getByTestId("language-system").props.accessibilityState.checked).toBe(true))

    fireEvent.press(getByTestId("language-en"))

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith("Error", "Could not change the language.", "error"))
    expect(getByTestId("language-system").props.accessibilityState.checked).toBe(true)
    expect(change).not.toHaveBeenCalled()
    change.mockRestore()
  })

  it("ignores a second tap while the first switch is still running", async () => {
    let finish: (tag: string) => void = () => {}
    mockSetAppLanguage.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { getByTestId } = render(<LanguageScreen navigation={{} as any} />)
    await waitFor(() => expect(getByTestId("language-en").props.accessibilityState.disabled).toBe(false))

    fireEvent.press(getByTestId("language-en"))
    fireEvent.press(getByTestId("language-system"))
    finish("en")

    await waitFor(() => expect(getByTestId("language-en").props.accessibilityState.disabled).toBe(false))
    expect(mockSetAppLanguage).toHaveBeenCalledTimes(1)
  })
})
