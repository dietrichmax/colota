import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { space } from "../../../../constants"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { TrackToggleButton } from "../TrackToggleButton"

const flat = (el: { props: { style?: unknown } }) =>
  Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))

type Node = { type: unknown; parent: Node | null; props: { style?: unknown } }
const disc = (el: Node) => {
  let node = el.parent
  while (node && node.type !== "View") node = node.parent
  return node as Node
}

describe("TrackToggleButton", () => {
  it("offers to show the track while it is hidden, with the struck glyph so colour is not the only signal", () => {
    const { getByRole, getByTestId, queryByTestId } = render(<TrackToggleButton onPress={jest.fn()} active={false} />)

    const el = getByRole("button")
    expect(el.props.accessibilityLabel).toBe("Show today's track")
    expect(el.props.accessibilityState).toEqual({ selected: false })
    expect(getByTestId("icon-RouteOff")).toBeTruthy()
    expect(queryByTestId("icon-Route")).toBeNull()
  })

  it("offers to hide the track while it is shown with the plain glyph and reads as selected", () => {
    const { getByRole, getByTestId, queryByTestId } = render(<TrackToggleButton onPress={jest.fn()} active />)

    const el = getByRole("button")
    expect(el.props.accessibilityLabel).toBe("Hide today's track")
    expect(el.props.accessibilityState).toEqual({ selected: true })
    expect(getByTestId("icon-Route")).toBeTruthy()
    expect(queryByTestId("icon-RouteOff")).toBeNull()
  })

  it("anchors to the map's bottom-left by default, where the map screens expect it", () => {
    const { getByRole } = render(<TrackToggleButton onPress={jest.fn()} active={false} />)

    const style = flat(disc(getByRole("button")))
    expect(style.position).toBe("absolute")
    expect(style.left).toBe(space.lg)
  })

  it("drops the anchor and the left offset when placed in a row, so the row decides where it sits", () => {
    const { getByRole } = render(<TrackToggleButton onPress={jest.fn()} active={false} anchored={false} />)

    const style = flat(disc(getByRole("button")))
    expect(style.position).toBeUndefined()
    expect(style.bottom).toBeUndefined()
    expect(style.left).toBeUndefined()
  })

  it("toggles on press", () => {
    const onPress = jest.fn()
    const { getByRole } = render(<TrackToggleButton onPress={onPress} active={false} />)

    fireEvent.press(getByRole("button"))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
