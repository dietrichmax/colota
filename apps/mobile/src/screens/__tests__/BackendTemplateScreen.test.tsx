import React from "react"
import { render, fireEvent } from "@testing-library/react-native"

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    RadioRow: ({ testID, label, sub, selected, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, accessibilityRole: "radio", accessibilityState: { checked: selected } },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      )
  }
})

import { BackendTemplateScreen } from "../BackendTemplateScreen"
import { API_TEMPLATES } from "../../types/global"

describe("BackendTemplateScreen", () => {
  const mockPopTo = jest.fn()
  const navigation = { popTo: mockPopTo }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function renderScreen(selected = "custom") {
    return render(<BackendTemplateScreen navigation={navigation as any} route={{ params: { selected } } as any} />)
  }

  it("describes every template on its own row, which is why this is a screen and not a menu", () => {
    const { getByText } = renderScreen()

    Object.values(API_TEMPLATES).forEach((template) => {
      expect(getByText(template.label)).toBeTruthy()
      expect(getByText(template.description)).toBeTruthy()
    })
  })

  it("offers Custom alongside the templates, because it is a choice and not an absence", () => {
    const { getByTestId, getByText } = renderScreen()

    expect(getByTestId("template-custom")).toBeTruthy()
    expect(getByText("Your own field names, mapped by hand")).toBeTruthy()
  })

  it("marks the incoming selection so you can see what you are on", () => {
    const { getByTestId } = renderScreen("traccar")

    expect(getByTestId("template-traccar").props.accessibilityState.checked).toBe(true)
    expect(getByTestId("template-custom").props.accessibilityState.checked).toBe(false)
  })

  it("hands the choice back and returns, rather than pushing another copy of the parent", () => {
    const { getByTestId } = renderScreen()

    fireEvent.press(getByTestId("template-dawarich"))

    expect(mockPopTo).toHaveBeenCalledWith("API Config", { template: "dawarich" }, { merge: true })
  })
})
