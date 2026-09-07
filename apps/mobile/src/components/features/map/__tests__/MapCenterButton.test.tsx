import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { size, space } from "../../../../constants"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { MapCenterButton } from "../MapCenterButton"

const flat = (el: { props: { style?: unknown } }) =>
  Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))

type Node = { type: unknown; parent: Node | null; props: { style?: unknown } }
const disc = (el: Node) => {
  let node = el.parent
  while (node && node.type !== "View") node = node.parent
  return node as Node
}

describe("MapCenterButton", () => {
  it("is named for a screen reader, because the crosshair glyph carries no text", () => {
    const { getByRole } = render(<MapCenterButton onPress={jest.fn()} visible />)

    expect(getByRole("button").props.accessibilityLabel).toBe("Centre map on my position")
  })

  it("renders nothing while the map is already centred, so the disc is an offer and not a fixture", () => {
    const { queryByRole } = render(<MapCenterButton onPress={jest.fn()} visible={false} />)

    expect(queryByRole("button")).toBeNull()
  })

  it("stacks one slot above the attribution disc, far enough that the two touch targets meet without overlapping", () => {
    const { getByRole } = render(<MapCenterButton onPress={jest.fn()} visible />)

    const style = flat(disc(getByRole("button")))
    expect(style.right).toBe(space.lg)
    expect(style.bottom).toBe(space.xxl + size.iconColumn + space.lg)
  })

  it("lets a screen move it into its own disc column", () => {
    const bottom = space.lg + size.iconColumn
    const { getByRole } = render(<MapCenterButton onPress={jest.fn()} visible style={{ bottom }} />)

    expect(flat(disc(getByRole("button"))).bottom).toBe(bottom)
  })

  it("recentres on press", () => {
    const onPress = jest.fn()
    const { getByRole } = render(<MapCenterButton onPress={onPress} visible />)

    fireEvent.press(getByRole("button"))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
