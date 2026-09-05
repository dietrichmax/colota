import React from "react"
import { Animated, Dimensions, Modal, Text } from "react-native"
import { render, within } from "@testing-library/react-native"
import { Sheet } from "../Sheet"
import { motion, size } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("Sheet", () => {
  const props = {
    title: "Delete trip",
    children: <Text>This cannot be undone.</Text>,
    actions: <Text>Delete</Text>
  }

  it("renders nothing until it is asked for", () => {
    const { queryByText } = render(<Sheet {...props} visible={false} onDismiss={jest.fn()} />)

    expect(queryByText("Delete trip")).toBeNull()
  })

  // The window is its own Dialog, so back only reaches JS through onRequestClose. A sheet
  // that must be answered leaves it out instead of swallowing the press somewhere else.
  it("hands back to the dismiss callback and offers the scrim as a Close button", () => {
    const onDismiss = jest.fn()
    const { UNSAFE_getByType, getByRole } = render(<Sheet {...props} visible onDismiss={onDismiss} />)

    UNSAFE_getByType(Modal).props.onRequestClose()
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(getByRole("button", { name: "Close" })).toBeTruthy()
  })

  it("leaves back and the scrim inert without a dismiss callback", () => {
    const { UNSAFE_getByType, queryByLabelText } = render(<Sheet {...props} visible />)

    expect(UNSAFE_getByType(Modal).props.onRequestClose).toBeUndefined()
    expect(queryByLabelText("Close")).toBeNull()
  })

  // The buttons live outside the scroller so a disclosure that runs past the screen at a
  // 2.0x font scale still shows what to press.
  it("scrolls the body and pins the actions below it", () => {
    const { getByTestId } = render(<Sheet {...props} visible onDismiss={jest.fn()} actions={<Text>Not Now</Text>} />)

    expect(within(getByTestId("sheet-body")).getByText("This cannot be undone.")).toBeTruthy()
    expect(within(getByTestId("sheet-body")).queryByText("Not Now")).toBeNull()
    expect(within(getByTestId("sheet-actions")).getByText("Not Now")).toBeTruthy()
  })

  it("caps itself at nine tenths of the window and pads for the gesture inset", () => {
    const { getByTestId } = render(<Sheet {...props} visible onDismiss={jest.fn()} testID="sheet" />)

    const style = flatten(getByTestId("sheet").props.style)
    expect(style.maxWidth).toBe(size.column)
    expect(style.maxHeight).toBeCloseTo(Dimensions.get("window").height * 0.9)
    expect(style.paddingBottom).toBe(24 + 24)
  })

  // The Modal itself is animationType="none": the sheet owns its motion so entry and exit
  // can run at different tokens, which is what tells the user which way it is going.
  it("enters on the enter token", () => {
    const timing = jest.spyOn(Animated, "timing")

    render(<Sheet {...props} visible onDismiss={jest.fn()} />)

    expect(timing.mock.calls[0][1]).toEqual(
      expect.objectContaining({ toValue: 1, duration: motion.enter.duration, easing: motion.enter.easing })
    )
    timing.mockRestore()
  })

  it("leaves on the exit token", () => {
    const timing = jest.spyOn(Animated, "timing")
    const { rerender } = render(<Sheet {...props} visible onDismiss={jest.fn()} />)
    timing.mockClear()

    rerender(<Sheet {...props} visible={false} onDismiss={jest.fn()} />)

    expect(timing.mock.calls[0][1]).toEqual(
      expect.objectContaining({ toValue: 0, duration: motion.exit.duration, easing: motion.exit.easing })
    )
    timing.mockRestore()
  })

  it("gives the title the header role so the screen reader lands on a heading", () => {
    const { getByRole } = render(<Sheet {...props} visible onDismiss={jest.fn()} />)

    expect(getByRole("header", { name: "Delete trip" })).toBeTruthy()
  })
})
