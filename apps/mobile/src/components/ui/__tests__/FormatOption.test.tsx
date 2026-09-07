import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { Globe } from "lucide-react-native"
import { FormatOption } from "../FormatOption"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: jest.requireActual("@colota/shared").lightColors })
}))

function renderOption(selected = false) {
  const onPress = jest.fn()
  const view = render(
    <FormatOption
      icon={Globe}
      title="GeoJSON"
      subtitle="Geographic Data"
      description="Mapbox, Leaflet, QGIS."
      extension=".geojson"
      selected={selected}
      onPress={onPress}
    />
  )
  return { ...view, onPress }
}

describe("FormatOption", () => {
  it("carries the extension as text, so no badge paints the accent", () => {
    const { getByText } = renderOption()

    expect(getByText("Geographic Data · .geojson")).toBeTruthy()
  })

  it("marks selection with the dot alone, leaving the title one colour", () => {
    const unselected = renderOption(false)
    const selected = renderOption(true)

    expect(unselected.getByText("GeoJSON").props.style).toEqual(selected.getByText("GeoJSON").props.style)
  })

  it("says what it is to a screen reader, including the extension the badge used to carry", () => {
    const { getByRole } = renderOption(true)
    const row = getByRole("radio")

    expect(row.props.accessibilityLabel).toBe("GeoJSON, .geojson, Geographic Data")
    expect(row.props.accessibilityState).toMatchObject({ checked: true })
  })

  it("reports the choice", () => {
    const { getByRole, onPress } = renderOption()

    fireEvent.press(getByRole("radio"))

    expect(onPress).toHaveBeenCalled()
  })
})
