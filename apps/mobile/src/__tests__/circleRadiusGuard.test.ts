// See designSystemGuard for why this file declares the node corner it needs by hand.
declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

import { radius } from "@colota/shared"

/**
 * A radius that is half a width is a circle stated as arithmetic, and it stops being one the moment
 * the size changes. Two rounded a 24px dot with `radius.md`, which is a circle only by coincidence.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components"]
const SCALE: Record<string, number> = radius

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

function circlesWrittenAsArithmetic(source: string): string[] {
  const found: string[] = []

  for (const style of source.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    const body = style[2]
    const width = body.match(/\bwidth:\s*([\d.]+)/)
    const height = body.match(/\bheight:\s*([\d.]+)/)
    if (!width || !height || width[1] !== height[1]) continue

    const literal = body.match(/borderRadius:\s*([\d.]+)/)
    const token = body.match(/borderRadius:\s*radius\.(\w+)/)
    const drawn = literal ? parseFloat(literal[1]) : token ? SCALE[token[1]] : null
    if (drawn === null || drawn === undefined) continue

    if (Math.abs(drawn - parseFloat(width[1]) / 2) < 0.01) {
      found.push(`${style[1]}: ${width[1]}px with borderRadius ${literal ? literal[1] : `radius.${token![1]}`}`)
    }
  }

  return found
}

describe("circle radius guard", () => {
  const files = sourceFiles()

  it("finds the shapes it is meant to police", () => {
    const square = files.filter((f) => /\bwidth:\s*[\d.]+/.test(fs.readFileSync(path.join(SRC, f), "utf8")))

    expect(square).toContain("components/ui/RadioDot.tsx")
    expect(square.length).toBeGreaterThan(10)
  })

  it("draws every circle with radius.pill rather than half its own width", () => {
    const arithmetic: string[] = []

    for (const file of files) {
      for (const style of circlesWrittenAsArithmetic(fs.readFileSync(path.join(SRC, file), "utf8"))) {
        arithmetic.push(`${file}: ${style}`)
      }
    }

    expect(arithmetic).toEqual([])
  })
})
