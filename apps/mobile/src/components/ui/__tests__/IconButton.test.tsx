import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { X } from "lucide-react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { IconButton } from "../IconButton"

describe("IconButton", () => {
  it("reaches the 48 Android touch target without growing the disc", () => {
    // Six controls sat at 32 to 44 inside tight rows. Growing them would reflow every row,
    // so the painted disc stays and hitSlop makes up the difference.
    const { getByTestId } = render(
      <IconButton icon={X} onPress={jest.fn()} accessibilityLabel="Remove this header" testID="rm" />
    )

    const el = getByTestId("rm")
    const style = Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    expect(style.width + el.props.hitSlop.left + el.props.hitSlop.right).toBe(48)
    expect(style.height + el.props.hitSlop.top + el.props.hitSlop.bottom).toBe(48)
  })

  it("is named for a screen reader, because the glyph carries no text", () => {
    const { getByLabelText } = render(
      <IconButton icon={X} onPress={jest.fn()} accessibilityLabel="Remove this header" />
    )
    expect(getByLabelText("Remove this header")).toBeTruthy()
  })

  it("swallows the press while loading", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <IconButton icon={X} onPress={onPress} accessibilityLabel="Refresh" loading testID="rf" />
    )

    fireEvent.press(getByTestId("rf"))
    expect(onPress).not.toHaveBeenCalled()
    expect(getByTestId("rf").props.accessibilityState.disabled).toBe(true)
  })
})
