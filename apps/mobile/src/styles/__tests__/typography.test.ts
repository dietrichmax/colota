/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { type } from "@colota/shared"
import type { TypeRoleName } from "@colota/shared"
import { text, fonts } from "../typography"

const roleNames = Object.keys(type) as TypeRoleName[]

describe("text roles", () => {
  it("composes every shared role, so a role added upstream cannot be missing here", () => {
    expect(Object.keys(text).sort()).toEqual([...roleNames].sort())
  })

  it.each(roleNames)("%s carries the size, line height and variants of its shared role", (name) => {
    const role = type[name]
    expect(text[name]).toMatchObject({
      fontSize: role.fontSize,
      lineHeight: role.lineHeight,
      letterSpacing: role.letterSpacing,
      fontVariant: role.fontVariant
    })
  })

  it("resolves the weight name to a real Inter face rather than a numeric fontWeight", () => {
    expect(text.body.fontFamily).toBe(fonts.regular.fontFamily)
    expect(text.bodyStrong.fontFamily).toBe(fonts.medium.fontFamily)
    expect(text.title.fontFamily).toBe(fonts.semiBold.fontFamily)
    expect(text.body.fontWeight).toBeUndefined()
  })

  it("keeps mono off the Inter family, because Inter has no monospace face", () => {
    expect(text.mono.fontFamily).toBe("monospace")
  })

  it("gives the figure roles tabular figures so numbers do not shift as they update", () => {
    for (const name of ["display", "figureInline", "coord"] as const) {
      expect(text[name].fontVariant).toContain("tabular-nums")
    }
  })

  it("copies fontVariant so a StyleSheet consumer cannot mutate the shared token", () => {
    expect(text.coord.fontVariant).not.toBe(type.coord.fontVariant)
  })
})
