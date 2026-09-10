// See designSystemGuard for why this file declares the node corner it needs by hand.
declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

import { size, HIT_SLOP_MD } from "../constants"

/**
 * A chip is 32 by Material and 32 is under Android's 48 touch minimum, so every chip needs
 * hitSlop to be reliably hittable. Three of the four in the app were hand-built and sat at 26
 * to 33 with no slop at all, which no render test caught because each looked right on its own.
 *
 * This walks the tree instead: any style whose name ends in Chip must set minHeight from the
 * token, and the file it lives in must reach for HIT_SLOP_MD. A badge is exempt because it is
 * a label, not a control.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components"]

function sourceFiles(): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(rel)
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push(rel)
      }
    }
  }
  ROOTS.forEach(walk)
  return found.sort()
}

const CHIP_STYLE = /^\s{2}(\w*[Cc]hip)\s*:\s*\{([\s\S]*?)^\s{2}\},?$/gm

function chipStyles(source: string): { name: string; body: string }[] {
  const found: { name: string; body: string }[] = []
  for (const match of source.matchAll(CHIP_STYLE)) {
    // chipText and the like are the label inside the chip, not the chip.
    if (/text$/i.test(match[1])) continue
    found.push({ name: match[1], body: match[2] })
  }
  return found
}

describe("chip guard", () => {
  const files = sourceFiles()

  it("finds the chips it is meant to police", () => {
    const withChips = files.filter((f) => chipStyles(fs.readFileSync(path.join(SRC, f), "utf8")).length > 0)

    expect(withChips).toContain("components/ui/ChipGroup.tsx")
    expect(withChips).toContain("components/features/inspector/InspectorDock.tsx")
  })

  it("gives every chip the token height, so none of them drifts back to a literal", () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = fs.readFileSync(path.join(SRC, file), "utf8")
      for (const chip of chipStyles(source)) {
        if (!/minHeight:\s*size\.chip\b/.test(chip.body)) offenders.push(`${file} ${chip.name}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it("gives every chip slop, because 32 alone does not reach the touch minimum", () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = fs.readFileSync(path.join(SRC, file), "utf8")
      if (chipStyles(source).length === 0) continue
      if (!/hitSlop=\{HIT_SLOP_MD\}/.test(source)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })

  it("keeps the arithmetic true: the chip plus its slop clears the touch target", () => {
    expect(size.chip + HIT_SLOP_MD.top + HIT_SLOP_MD.bottom).toBeGreaterThanOrEqual(size.touch)
  })
})
