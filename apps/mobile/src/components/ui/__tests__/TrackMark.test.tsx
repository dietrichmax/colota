import React from "react"
import { render } from "@testing-library/react-native"
import { TrackMark } from "../TrackMark"

describe("TrackMark", () => {
  it("draws a track that starts as a solid disc and ends as a ring, in the colour and weight it is given", () => {
    const { UNSAFE_getAllByType } = render(<TrackMark size={24} color="#0B7D73" strokeWidth={2.25} />)
    const { Circle, Path } = require("react-native-svg")

    const path = UNSAFE_getAllByType(Path)[0]
    expect(path.props.stroke).toBe("#0B7D73")
    expect(path.props.strokeWidth).toBe(2.25)

    const [disc, ring] = UNSAFE_getAllByType(Circle)
    expect(disc.props.fill).toBe("#0B7D73")
    expect(ring.props.fill).toBeUndefined()
    expect(ring.props.stroke).toBe("#0B7D73")
  })
})
