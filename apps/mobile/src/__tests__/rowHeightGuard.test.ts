// See designSystemGuard for why this file declares the node corner it needs by hand.
declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

/**
 * SettingRow owns its metrics: 56 minimum and space.lg above and below, which is Material's 56
 * for one line and 72 for two. A caller that pads it again changes the height of some rows and
 * not others, and the run reads as ragged where it is meant to read as a list.
 *
 * Two screens did exactly that. The geofence editor paid 10 on four pause toggles, leaving them
 * near 61 beside its own full-height Timeout row; the sync settings paid 0 on top of the first
 * quality filter, leaving it near 57 with its text against the top edge. Neither value is on the
 * space scale, so designSystemGuard is right to ignore them and could never have caught either.
 *
 * ListItem has no style prop at all, which is the other way to solve this. SettingRow keeps one
 * because a caller does legitimately need to reach the row (the disabled state, a testID wrapper),
 * so the prop stays and this rule says what may not travel through it.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components"]

/** Anything that moves the row's edges or its content within them. */
const OWNED = /^\s*(padding|margin|height|minHeight|maxHeight)/m

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

function styleBody(source: string, name: string): string {
  const inline = new RegExp(`^\\s{2}${name}\\s*:\\s*\\{([^\\n}]*)\\},?$`, "m").exec(source)
  if (inline) return inline[1]
  const block = new RegExp(`^\\s{2}${name}\\s*:\\s*\\{([\\s\\S]*?)^\\s{2}\\},?$`, "m").exec(source)
  return block ? block[1] : ""
}

/** Every style name reaching a SettingRow, with the line the tag opens on. */
export function rowStyles(source: string): { line: number; style: string }[] {
  const lines = source.split("\n")
  const found: { line: number; style: string }[] = []

  lines.forEach((line, index) => {
    if (!/<SettingRow\b/.test(line)) return
    // The opening tag runs to the first line ending in `>`; a SettingRow always has children.
    const tag: string[] = []
    for (let i = index; i < lines.length; i++) {
      tag.push(lines[i])
      if (/>\s*$/.test(lines[i])) break
    }
    const match = /style=\{\[?styles\.(\w+)/.exec(tag.join("\n"))
    if (match) found.push({ line: index + 1, style: match[1] })
  })

  return found
}

describe("row height guard", () => {
  const files = sourceFiles()

  it("reads the screens that hold the rows", () => {
    expect(files).toContain("screens/GeofenceEditorScreen.tsx")
    expect(files).toContain("components/features/settings/SyncStrategySettings.tsx")
  })

  it("recognises a style reaching the row, whatever shape the tag takes", () => {
    expect(rowStyles(`          <SettingRow label="A" hint="b" style={styles.toggleRow}>`)).toEqual([
      { line: 1, style: "toggleRow" }
    ])
    expect(
      rowStyles(
        [
          "          <SettingRow",
          "            style={styles.firstInGroup}",
          '            label="A"',
          "          >"
        ].join("\n")
      )
    ).toEqual([{ line: 1, style: "firstInGroup" }])
    expect(rowStyles(`          <SettingRow label="A" hint="b">`)).toEqual([])
  })

  it("names the two shapes that shipped, so a revert fails here", () => {
    expect(OWNED.test("    paddingVertical: 10")).toBe(true)
    expect(OWNED.test("    paddingTop: 0")).toBe(true)
    // A caller may still reach the row for something that is not its metrics.
    expect(OWNED.test("    flex: 1")).toBe(false)
    expect(OWNED.test("    opacity: 0.5")).toBe(false)
  })

  it("leaves the row's own height to the row", () => {
    const offenders = files.flatMap((file) => {
      const source = fs.readFileSync(path.join(SRC, file), "utf8")
      return rowStyles(source)
        .filter((entry) => OWNED.test(styleBody(source, entry.style)))
        .map((entry) => `${file}:${entry.line} passes styles.${entry.style}`)
    })

    expect(offenders).toEqual([])
  })
})
