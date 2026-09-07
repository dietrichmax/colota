// See designSystemGuard for why this file declares the node corner it needs by hand.
export {}

declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

/**
 * A bare `Pressable` announces nothing to TalkBack: no role, so it does not read as a control, and
 * usually no name either, so there is nothing to read out. Data management shipped three
 * destructive actions that way and the offline-maps delete disc sat silent beside an IconButton
 * that looks identical.
 *
 * `none` is a real answer for a modal scrim and for the view that swallows a tap inside it, which
 * is why this asks for a role rather than for a label.
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

/**
 * Reads each opening tag by tracking brace depth. A regex cannot: `onPress={() => x}` puts a `>`
 * inside the tag, so matching to the first one stops before the props that follow it and reports
 * tags as bare when they are not.
 */
function openingTags(source: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = []
  let from = 0

  for (;;) {
    const start = source.indexOf("<Pressable", from)
    if (start === -1) return tags

    let i = start + "<Pressable".length
    let depth = 0
    let quote: string | null = null

    for (; i < source.length; i++) {
      const c = source[i]
      if (quote) {
        if (c === quote && source[i - 1] !== "\\") quote = null
        continue
      }
      if (c === '"' || c === "'" || c === "`") quote = c
      else if (c === "{") depth++
      else if (c === "}") depth--
      else if (c === ">" && depth === 0 && source[i - 1] !== "=") break
    }

    tags.push({ tag: source.slice(start, i), line: source.slice(0, start).split("\n").length })
    from = i
  }
}

describe("pressable role guard", () => {
  const files = sourceFiles()

  it("finds the Pressables it is meant to police", () => {
    const total = files.reduce((n, f) => n + openingTags(fs.readFileSync(path.join(SRC, f), "utf8")).length, 0)

    expect(total).toBeGreaterThan(50)
  })

  it("reads a tag past the arrow in an inline handler", () => {
    const [only] = openingTags(`<Pressable onPress={() => go()} accessibilityRole="button">x</Pressable>`)

    expect(only.tag).toContain("accessibilityRole")
  })

  it("gives every Pressable a role, so none of them announces as nothing", () => {
    const bare: string[] = []

    for (const file of files) {
      for (const { tag, line } of openingTags(fs.readFileSync(path.join(SRC, file), "utf8"))) {
        if (!/accessibilityRole/.test(tag)) bare.push(`${file}:${line}`)
      }
    }

    expect(bare).toEqual([])
  })
})
