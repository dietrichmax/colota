// See designSystemGuard for why this file declares the node corner it needs by hand.
declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

import { space } from "../constants"

/**
 * TextField deliberately carries no vertical margin: half its call sites sit in a row beside a
 * unit, a button or a second field, and a baked margin cannot be subtracted by a caller. So the
 * stack owns the gap, and screens that forgot produced five different values for one distance:
 * 0 on Appearance, a 14 literal on Auth, 8 elsewhere.
 *
 * The label sits space.sm above its own box, so a labelled pair takes space.lg between fields:
 * twice the inner distance, which is what binds each label to the field below it rather than to
 * the field above. Two fields with no labels are one compound control (a header name and its
 * value) and may sit tighter, so they only have to name a token.
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
      } else if (/\.tsx$/.test(entry.name)) {
        found.push(rel)
      }
    }
  }
  ROOTS.forEach(walk)
  return found.sort()
}

type Pair = { file: string; line: number; labelled: boolean; parent: string | null }

/** A tag runs from its `<TextField` line to the `/>` at the same indent. */
function tagEnd(lines: string[], start: number, indent: string): number {
  for (let i = start; i < lines.length; i++) {
    if (lines[i] === `${indent}/>`) return i
  }
  return start
}

/** The nearest enclosing element that names a style, which is the stack that owns the gap. */
function parentStyle(lines: string[], from: number, indent: string): string | null {
  for (let i = from; i >= 0; i--) {
    const line = lines[i]
    if (line.trim() === "") continue
    if (line.length - line.trimStart().length >= indent.length) continue
    const match = /<\w+[^\n]*style=\{\[?styles\.(\w+)/.exec(line)
    return match ? match[1] : null
  }
  return null
}

function styleBody(source: string, name: string): string {
  const match = new RegExp(`^\\s{2}${name}\\s*:\\s*\\{([\\s\\S]*?)^\\s{2}\\},?$`, "m").exec(source)
  return match ? match[1] : ""
}

/**
 * Two TextFields are stacked when they open at the same indent and nothing between them is
 * shallower, which is what says they are still inside the same parent rather than in a row of
 * wrappers, as the geofence name and radius are.
 */
function stackedPairs(file: string, source: string): Pair[] {
  const lines = source.split("\n")
  const pairs: Pair[] = []
  let prev: { end: number; indent: string; labelled: boolean } | null = null

  lines.forEach((line, index) => {
    const opening = /^(\s*)<\w*(?:TextField|Field)\b/.exec(line)
    if (!opening) {
      if (
        prev &&
        index > prev.end &&
        line.trim() !== "" &&
        line.length - line.trimStart().length < prev.indent.length
      ) {
        prev = null
      }
      return
    }
    const indent = opening[1]
    const end = tagEnd(lines, index, indent)
    const labelled = lines.slice(index, end + 1).some((l) => /^\s*label=/.test(l))
    if (prev && prev.indent === indent) {
      pairs.push({
        file,
        line: index + 1,
        labelled: labelled && prev.labelled,
        parent: parentStyle(lines, index - 1, indent)
      })
    }
    prev = { end, indent, labelled }
  })

  return pairs
}

describe("field spacing guard", () => {
  const files = sourceFiles()
  const pairs = files.flatMap((file) => stackedPairs(file, fs.readFileSync(path.join(SRC, file), "utf8")))

  it("finds the stacks it is meant to police", () => {
    expect(pairs.map((p) => p.file)).toContain("screens/AppearanceScreen.tsx")
    expect(pairs.map((p) => p.file)).toContain("screens/AuthSettingsScreen.tsx")
  })

  it("hands every stack of fields to a container that spaces them", () => {
    const offenders = pairs
      .filter((pair) => {
        if (!pair.parent) return true
        const source = fs.readFileSync(path.join(SRC, pair.file), "utf8")
        return !/gap:\s*space\.\w+/.test(styleBody(source, pair.parent))
      })
      .map((pair) => `${pair.file}:${pair.line} in ${pair.parent ?? "an unnamed container"}`)

    expect(offenders).toEqual([])
  })

  it("keeps the arithmetic true: the gap is twice the label's own distance from its field", () => {
    expect(space.lg).toBe(space.sm * 2)
  })

  it("keeps a labelled pair at twice the distance the label sits from its own field", () => {
    const offenders = pairs
      .filter((pair) => {
        if (!pair.labelled || !pair.parent) return false
        const source = fs.readFileSync(path.join(SRC, pair.file), "utf8")
        return !/gap:\s*space\.lg\b/.test(styleBody(source, pair.parent))
      })
      .map((pair) => `${pair.file}:${pair.line} in ${pair.parent}`)

    expect(offenders).toEqual([])
  })
})
