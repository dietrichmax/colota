import React from "react"
import { render, fireEvent } from "@testing-library/react-native"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { lightColors } from "@colota/shared"
import { CRITICAL_QUEUE_THRESHOLD, HIGH_QUEUE_THRESHOLD } from "../../../../constants"
import { QueueWarning } from "../QueueWarning"

describe("QueueWarning", () => {
  it("stays out of the way while the queue is draining", () => {
    // Settings used to carry a strip that showed a queue of 5 as prominently as a queue of 500.
    const { toJSON } = render(<QueueWarning queueCount={HIGH_QUEUE_THRESHOLD} onPress={jest.fn()} />)

    expect(toJSON()).toBeNull()
  })

  it("warns once the queue is over the threshold", () => {
    const { getByText } = render(<QueueWarning queueCount={HIGH_QUEUE_THRESHOLD + 1} onPress={jest.fn()} />)

    expect(getByText("High queue size")).toBeTruthy()
  })

  it("escalates to error past the critical threshold, so two sizes do not read alike", () => {
    const { getByText } = render(<QueueWarning queueCount={CRITICAL_QUEUE_THRESHOLD + 1} onPress={jest.fn()} />)

    expect(getByText("Critical queue size").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightColors.error })])
    )
  })

  it("opens data management, which is the only thing it can do about it", () => {
    const onPress = jest.fn()
    const { getByRole } = render(<QueueWarning queueCount={200} onPress={onPress} />)

    fireEvent.press(getByRole("button"))

    expect(onPress).toHaveBeenCalled()
  })
})
