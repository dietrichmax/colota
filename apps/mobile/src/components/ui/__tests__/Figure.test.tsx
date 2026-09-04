import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors, type as typeRoles } from "@colota/shared"
import { Figure, queueTone } from "../Figure"
import { CRITICAL_QUEUE_THRESHOLD, HIGH_QUEUE_THRESHOLD } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("Figure", () => {
  it("sets the digits in the display role and caps their growth", () => {
    const { getByText } = render(<Figure value="128" label="Points today" testID="today" />)

    const style = flatten(getByText("128").props.style)
    expect(style.fontSize).toBe(typeRoles.display.fontSize)
    expect(getByText("128").props.maxFontSizeMultiplier).toBe(1.5)
  })

  // The digits and their label are one fact. Left as two nodes TalkBack reads "128" and
  // then, after a swipe, "Points today", which is not the same sentence.
  it("reads the value, its unit and the label as one node", () => {
    const { getByLabelText } = render(<Figure value="12.4" unit="km" label="Distance" />)

    expect(getByLabelText("12.4 km, Distance")).toBeTruthy()
  })

  // A queue below the high threshold is the normal working state, so it stays ink. Colour
  // that appears while nothing is wrong stops meaning anything by the time it is.
  it("stays ink at the high-queue threshold and only warns above it", () => {
    expect(queueTone(HIGH_QUEUE_THRESHOLD)).toBe("default")
    expect(queueTone(HIGH_QUEUE_THRESHOLD + 1)).toBe("warning")

    const healthy = render(<Figure value="50" label="Queued" tone={queueTone(HIGH_QUEUE_THRESHOLD)} />)
    expect(flatten(healthy.getByText("50").props.style).color).toBe(lightColors.text)

    const filling = render(<Figure value="51" label="Queued" tone={queueTone(HIGH_QUEUE_THRESHOLD + 1)} />)
    expect(flatten(filling.getByText("51").props.style).color).toBe(lightColors.warning)
  })

  it("turns error only past the critical threshold", () => {
    expect(queueTone(CRITICAL_QUEUE_THRESHOLD)).toBe("warning")
    expect(queueTone(CRITICAL_QUEUE_THRESHOLD + 1)).toBe("error")

    const { getByText } = render(<Figure value="101" label="Queued" tone={queueTone(CRITICAL_QUEUE_THRESHOLD + 1)} />)
    expect(flatten(getByText("101").props.style).color).toBe(lightColors.error)
  })
})
