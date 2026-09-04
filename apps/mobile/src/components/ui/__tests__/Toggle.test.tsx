import React from "react"
import { Animated } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { Toggle } from "../Toggle"
import { motion } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

describe("Toggle", () => {
  // SwitchCompat is the Material 2 shape this rework replaces, so the row has to carry
  // the switch semantics itself or TalkBack loses the role the platform used to give.
  it("announces itself as a switch with its checked state", () => {
    const { getByRole } = render(
      <Toggle value onValueChange={jest.fn()} accessibilityLabel="Dark mode" testID="dark-toggle" />
    )

    const toggle = getByRole("switch", { name: "Dark mode" })
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ checked: true, disabled: false }))
  })

  // A painted track has no text of its own: without the label TalkBack reads "switch"
  // and nothing else, which is why the prop is required rather than optional.
  it("names itself from the label the row passes in", () => {
    const { getByTestId } = render(
      <Toggle value={false} onValueChange={jest.fn()} accessibilityLabel="Offline mode" testID="offline-toggle" />
    )

    expect(getByTestId("offline-toggle").props.accessibilityLabel).toBe("Offline mode")
  })

  it("reports the flipped value when pressed", () => {
    const onValueChange = jest.fn()
    const { getByTestId } = render(
      <Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Dark mode" testID="dark-toggle" />
    )

    fireEvent.press(getByTestId("dark-toggle"))

    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it("does not fire while disabled and says so in its state", () => {
    const onValueChange = jest.fn()
    const { getByTestId } = render(
      <Toggle value={false} onValueChange={onValueChange} disabled accessibilityLabel="Wifi pause" testID="wifi" />
    )

    fireEvent.press(getByTestId("wifi"))

    expect(onValueChange).not.toHaveBeenCalled()
    expect(getByTestId("wifi").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
  })

  // One animation drives the thumb and the track together off the motion token, so the
  // toggle cannot drift from the rest of the system on a literal duration.
  it("runs a single timing at the control motion token on the native driver", () => {
    const timing = jest.spyOn(Animated, "timing")
    const { rerender } = render(<Toggle value={false} onValueChange={jest.fn()} accessibilityLabel="Dark mode" />)
    timing.mockClear()

    rerender(<Toggle value onValueChange={jest.fn()} accessibilityLabel="Dark mode" />)

    expect(timing).toHaveBeenCalledTimes(1)
    expect(timing.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        toValue: 1,
        duration: motion.control.duration,
        easing: motion.control.easing,
        useNativeDriver: true
      })
    )
    timing.mockRestore()
  })
})
