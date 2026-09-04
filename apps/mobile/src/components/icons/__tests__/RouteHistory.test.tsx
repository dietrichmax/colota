import React from "react"
import { render } from "@testing-library/react-native"

// jest.setup.js mocks the whole of lucide with a Proxy that hands back a component for
// every property, so useLucideContext resolves to a component there and the provider is
// unreachable. Swapping in the library's real context module is what makes "this glyph
// cannot drift from the provider" an assertion rather than a device check. It has to be
// the CJS build reached by file path: the ESM barrel is untransformed, which is why the
// global mock exists at all, and the package's exports map hides every deep subpath.
jest.mock("lucide-react-native", () =>
  jest.requireActual("../../../../../../node_modules/lucide-react-native/dist/cjs/context.js")
)

const { LucideProvider } = require("lucide-react-native")
const { RouteHistory } = require("../RouteHistory")

const glyph = (tree: { getByTestId: (id: string) => { props: Record<string, unknown> } }) =>
  tree.getByTestId("icon-RouteHistory").props

describe("RouteHistory", () => {
  // Lucide's own construction rules: the 24 box, no fill, round terminals. A glyph drawn
  // to a different grid sits beside the set instead of inside it, which is the whole
  // reason the tab bar draws this one by hand rather than borrowing a near-miss.
  it("is drawn on Lucide's grid with open, round-terminated strokes", () => {
    const props = glyph(render(<RouteHistory color="#123456" />))

    expect(props.viewBox).toBe("0 0 24 24")
    expect(props.fill).toBe("none")
    expect(props.stroke).toBe("#123456")
    expect(props.strokeLinecap).toBe("round")
    expect(props.strokeLinejoin).toBe("round")
  })

  // The provider is the single weight for the whole icon set. If this glyph read a
  // constant instead, the tab bar would drift the moment the provider's value moved.
  it("takes its stroke from the provider", () => {
    const props = glyph(
      render(
        <LucideProvider strokeWidth={1.5}>
          <RouteHistory size={24} />
        </LucideProvider>
      )
    )

    expect(props.strokeWidth).toBe(1.5)
  })

  // absoluteStrokeWidth is what keeps a 16 badge and a 24 tab glyph the same weight on
  // screen: the viewBox stroke has to grow as the box shrinks, 1.5 * 24 / 16 = 2.25.
  it("scales the viewBox stroke so the painted weight holds at every size", () => {
    const at24 = glyph(
      render(
        <LucideProvider strokeWidth={1.5} absoluteStrokeWidth>
          <RouteHistory size={24} />
        </LucideProvider>
      )
    )
    const at16 = glyph(
      render(
        <LucideProvider strokeWidth={1.5} absoluteStrokeWidth>
          <RouteHistory size={16} />
        </LucideProvider>
      )
    )

    expect(at24.strokeWidth).toBe(1.5)
    expect(at16.strokeWidth).toBe(2.25)
  })

  // The active tab is carried by weight, so a per-icon strokeWidth has to beat the
  // provider the same way it does for every Lucide glyph.
  it("lets a per-icon strokeWidth override the provider", () => {
    const props = glyph(
      render(
        <LucideProvider strokeWidth={1.5} absoluteStrokeWidth>
          <RouteHistory size={24} strokeWidth={2.25} />
        </LucideProvider>
      )
    )

    expect(props.strokeWidth).toBe(2.25)
  })

  // Without a provider the glyph still has to render, because that is what every test in
  // the tree sees under the Proxy mock, and Lucide's own default is a 2 unit stroke.
  it("falls back to Lucide's default weight with no provider above it", () => {
    expect(glyph(render(<RouteHistory size={24} />)).strokeWidth).toBe(2)
  })
})
