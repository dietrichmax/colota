import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { size, space, STATE_LAYER_ALPHA } from "../../../../constants"
import { DayHeader, dayCaption, dayTitle } from "../DayHeader"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/geo", () => ({
  formatDistance: (meters: number) => `${(meters / 1000).toFixed(1)} km`
}))

const now = new Date(2026, 8, 8, 14, 30)
const today = new Date(2026, 8, 8)
const yesterday = new Date(2026, 8, 7)
const thisYear = new Date(2026, 8, 3)
const lastYear = new Date(2025, 8, 3)
const withTrips = { points: 412, trips: 3, distanceMeters: 12_400 }

describe("dayTitle", () => {
  it.each([
    ["today reads Today", today, "Today"],
    ["yesterday reads Yesterday", yesterday, "Yesterday"],
    ["a day this year carries weekday and date, no year", thisYear, "Thu, Sep 3"],
    ["a day in another year appends the year", lastYear, "Wed, Sep 3, 2025"]
  ])("%s", (_, date, expected) => {
    expect(dayTitle(date, now)).toBe(expected)
  })

  it("counts calendar days, so last night is Yesterday just after midnight", () => {
    expect(dayTitle(new Date(2026, 8, 7, 23, 59), new Date(2026, 8, 8, 0, 10))).toBe("Yesterday")
  })
})

describe("dayCaption", () => {
  it.each([
    ["loading beats every count", thisYear, withTrips, true, "Loading"],
    ["no stats yet reads as an empty day", thisYear, null, false, "No locations recorded"],
    [
      "zero points reads as an empty day",
      thisYear,
      { points: 0, trips: 0, distanceMeters: 0 },
      false,
      "No locations recorded"
    ],
    [
      "points without trips name the points",
      thisYear,
      { points: 412, trips: 0, distanceMeters: 0 },
      false,
      "412 points · no trips"
    ],
    ["trips lead, then distance, then points", thisYear, withTrips, false, "3 trips · 12.4 km · 412 points"],
    [
      "one trip and one point are singular",
      thisYear,
      { points: 1, trips: 1, distanceMeters: 300 },
      false,
      "1 trip · 0.3 km · 1 point"
    ]
  ])("%s", (_, date, stats, loading, expected) => {
    expect(dayCaption(date, stats, loading, now)).toBe(expected)
  })

  it("prefixes the short date when the title is relative, so Today still says which date it is", () => {
    expect(dayCaption(today, withTrips, false, now)).toBe("Sep 8 · 3 trips · 12.4 km · 412 points")
    expect(dayCaption(yesterday, null, false, now)).toBe("Sep 7 · No locations recorded")
    expect(dayCaption(today, null, true, now)).toBe("Sep 8 · Loading")
  })
})

type Node = { props: { android_ripple?: unknown; disabled?: boolean }; parent: Node | null }

// The ripple lives on the composite Pressable, which the host view the label finds does not carry.
const pressableOf = (host: Node): Node => {
  let node: Node | null = host
  while (node && node.props.android_ripple === undefined && node.props.disabled === undefined) node = node.parent
  return node ?? host
}

const props = {
  date: thisYear,
  stats: withTrips,
  loading: false,
  onPrevious: jest.fn(),
  onNext: jest.fn(),
  onOpenPicker: jest.fn(),
  nextDisabled: false
}

describe("DayHeader", () => {
  beforeEach(() => jest.clearAllMocks())

  it("shows the day as a title over its ledger, the two lines the screen is read by", () => {
    const { getByText } = render(<DayHeader {...props} />)

    expect(getByText("Thu, Sep 3")).toBeTruthy()
    expect(getByText("3 trips · 12.4 km · 412 points")).toBeTruthy()
  })

  it("speaks the full date and the ledger on the title button, so the calendar is found by ear", () => {
    const { getByTestId } = render(<DayHeader {...props} />)

    const centre = getByTestId("day-title")
    expect(centre.props.accessibilityRole).toBe("button")
    expect(centre.props.accessibilityLabel).toBe("Change day, Thursday, September 3, 3 trips · 12.4 km · 412 points")
    expect(centre.props.accessibilityHint).toBe("Opens the calendar")
  })

  it("steps a day with each chevron and opens the picker from the title", () => {
    const { getByLabelText, getByTestId } = render(<DayHeader {...props} />)

    fireEvent.press(getByLabelText("Previous day"))
    fireEvent.press(getByLabelText("Next day"))
    fireEvent.press(getByTestId("day-title"))

    expect(props.onPrevious).toHaveBeenCalledTimes(1)
    expect(props.onNext).toHaveBeenCalledTimes(1)
    expect(props.onOpenPicker).toHaveBeenCalledTimes(1)
  })

  it("disables the next chevron on today, dims its glyph and drops the ripple, with Today as the second signal", () => {
    const { getByLabelText, getByTestId, getByText } = render(<DayHeader {...props} date={new Date()} nextDisabled />)

    const next = getByLabelText("Next day")
    fireEvent.press(next)
    expect(props.onNext).not.toHaveBeenCalled()
    expect(next.props.accessibilityState).toEqual({ disabled: true })
    expect(pressableOf(next as unknown as Node).props.android_ripple).toBeUndefined()
    expect(getByTestId("icon-ChevronRight").props.color).toBe(lightColors.textDisabled)
    expect(getByText("Today")).toBeTruthy()
  })

  it("draws the chevrons as bare glyphs in 48 dp targets with a borderless ripple, not as discs", () => {
    const { getByLabelText, getByTestId } = render(<DayHeader {...props} />)

    const previous = getByLabelText("Previous day")
    expect(StyleSheet.flatten(previous.props.style).width).toBe(size.touch)
    expect(StyleSheet.flatten(previous.props.style).minHeight).toBe(size.touch)
    expect(StyleSheet.flatten(getByTestId("day-title").props.style).minHeight).toBe(size.touch)
    expect(pressableOf(previous as unknown as Node).props.android_ripple).toEqual({
      color: lightColors.text + STATE_LAYER_ALPHA,
      borderless: true,
      radius: size.touch / 2
    })
    expect(getByTestId("icon-ChevronLeft").props.color).toBe(lightColors.text)
    expect(getByTestId("icon-ChevronLeft").props.size).toBe(size.icon.md)
  })

  it("sits at row height on the plain background, so the header draws no band over the tiles", () => {
    const { getByTestId } = render(<DayHeader {...props} />)

    const row = StyleSheet.flatten(getByTestId("day-header").props.style)
    expect(row.minHeight).toBe(size.row)
    expect(row.backgroundColor).toBe(lightColors.background)
    expect(row.paddingHorizontal).toBe(space.sm)
    expect(row.minHeight - 2 * row.paddingVertical).toBe(size.touch)
  })

  it("gives the ledger tabular figures and a second line, so stepping days never jitters and a large font never truncates it", () => {
    const { getByText } = render(<DayHeader {...props} />)

    const caption = getByText("3 trips · 12.4 km · 412 points")
    expect(StyleSheet.flatten(caption.props.style).fontVariant).toEqual(["tabular-nums"])
    expect(caption.props.numberOfLines).toBe(2)
  })

  it("reads Loading while the day is fetched, so an empty caption never flashes between days", () => {
    const { getByText } = render(<DayHeader {...props} stats={null} loading />)

    expect(getByText("Loading")).toBeTruthy()
  })
})
