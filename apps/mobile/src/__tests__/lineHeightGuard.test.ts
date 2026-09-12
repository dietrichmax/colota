// See designSystemGuard for why this file declares the node corner it needs by hand.
declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

import { fontSizes, lineHeights } from "../styles/typography"

/**
 * A line height written per style drifts: 12sp text sat at 16, 17 and 18 across three screens, and
 * no render test compares two files. Every one comes from `lineHeights`, with no exemption.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components", "styles"]
const SIZE_FOR: Record<keyof typeof lineHeights, keyof typeof fontSizes> = {
  body: "body",
  description: "description",
  caption: "caption",
  small: "small",
  mono: "caption"
}

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

describe("line height guard", () => {
  const files = sourceFiles()

  it("finds the files it is meant to police", () => {
    const withLineHeights = files.filter((f) => /lineHeight:/.test(fs.readFileSync(path.join(SRC, f), "utf8")))

    expect(withLineHeights).toContain("components/ui/SettingRow.tsx")
    expect(withLineHeights).toContain("screens/ApiSettingsScreen.tsx")
    expect(withLineHeights.length).toBeGreaterThan(20)
  })

  it("takes every line height from the token", () => {
    const literals: string[] = []

    for (const file of files) {
      const source = fs.readFileSync(path.join(SRC, file), "utf8")
      for (const match of source.matchAll(/lineHeight:\s*(\d+)/g)) {
        literals.push(`${file}: lineHeight: ${match[1]}`)
      }
    }

    expect(literals).toEqual([])
  })

  it("keeps every token within Material's leading range for its size", () => {
    const tight: string[] = []

    for (const [name, height] of Object.entries(lineHeights)) {
      const ratio = height / fontSizes[SIZE_FOR[name as keyof typeof lineHeights]]
      if (ratio < 1.3 || ratio > 1.5) tight.push(`${name}: ${height} / ${ratio.toFixed(2)}x`)
    }

    expect(tight).toEqual([])
  })
})
