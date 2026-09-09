import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { EXPORT_FORMAT_KEYS, EXPORT_FORMATS } from "../../../utils/exportConverters"
import { ExportFormatDialog } from "../ExportFormatDialog"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

function renderDialog(overrides: Partial<React.ComponentProps<typeof ExportFormatDialog>> = {}) {
  const props = {
    visible: true,
    title: "Export day",
    message: "Wed, Sep 3 · 3 trips · 12.4 km",
    onSelect: jest.fn(),
    onRequestClose: jest.fn(),
    ...overrides
  }
  return { ...render(<ExportFormatDialog {...props} />), props }
}

describe("ExportFormatDialog", () => {
  it("lists every export format as a row with what it is for, so the choice is not four bare words", () => {
    const { getByText } = renderDialog()

    expect(getByText("Export day")).toBeTruthy()
    expect(getByText("Wed, Sep 3 · 3 trips · 12.4 km")).toBeTruthy()
    for (const key of EXPORT_FORMAT_KEYS) {
      expect(getByText(EXPORT_FORMATS[key].label)).toBeTruthy()
      expect(getByText(EXPORT_FORMATS[key].description)).toBeTruthy()
    }
  })

  it("hands back the tapped format, because a list dialog acts on the tap", () => {
    const { getByTestId, props } = renderDialog()

    fireEvent.press(getByTestId("export-gpx"))

    expect(props.onSelect).toHaveBeenCalledWith("gpx")
  })

  it("closes without a format from Cancel", () => {
    const { getByTestId, props } = renderDialog()

    fireEvent.press(getByTestId("export-cancel"))

    expect(props.onRequestClose).toHaveBeenCalled()
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it("renders nothing while hidden", () => {
    const { queryByText } = renderDialog({ visible: false })

    expect(queryByText("Export day")).toBeNull()
  })
})
