import { getQueueColor } from "../queueStatus"
import { ThemeColors } from "../../types/global"

const mockColors = {
  text: "#202124",
  warning: "#FF9800",
  error: "#D32F2F"
} as ThemeColors

describe("getQueueColor", () => {
  it("returns text color for zero items", () => {
    expect(getQueueColor(0, mockColors)).toBe(mockColors.text)
  })

  it("returns text color for count at threshold boundary (50)", () => {
    expect(getQueueColor(50, mockColors)).toBe(mockColors.text)
  })

  it("returns warning color when count exceeds 50", () => {
    expect(getQueueColor(51, mockColors)).toBe(mockColors.warning)
  })

  it("returns warning color at critical boundary (100)", () => {
    expect(getQueueColor(100, mockColors)).toBe(mockColors.warning)
  })

  it("returns error color when count exceeds 100", () => {
    expect(getQueueColor(101, mockColors)).toBe(mockColors.error)
  })

  it("returns error color for very large counts", () => {
    expect(getQueueColor(10000, mockColors)).toBe(mockColors.error)
  })

  it("returns text color for negative numbers", () => {
    expect(getQueueColor(-1, mockColors)).toBe(mockColors.text)
  })
})
