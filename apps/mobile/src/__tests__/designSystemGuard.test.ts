import allowlist from "./designSystemAllowlist.json"

// The app's tsconfig exposes only the jest globals on purpose, so nothing in src can reach
// for node. Reading the tree is what this file does, so it declares the corner it needs
// rather than opening node's globals to every screen.
declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: {
  join: (...parts: string[]) => string
  relative: (from: string, to: string) => string
} = require("path")

/**
 * Screens compose primitives so the design stays one system. A screen that writes its own
 * border, radius, elevation, shadow, type size, weight, colour or animation forks the
 * system quietly: it still renders, nothing fails, and the next palette or spacing change
 * misses it. This guard makes that fork loud.
 *
 * Test files are left out on purpose - they assert against tokens and are not screens.
 * designSystemAllowlist.json names what has not migrated yet and shrinks with every screen
 * PR; an entry that no longer matches fails too, so the list cannot outlive the code it
 * excuses, and by PR 15 only the files that draw over map tiles are left in it.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components/features", "utils"]

const RULES = [
  { name: "borderWidth", pattern: /borderWidth/ },
  { name: "borderRadius", pattern: /borderRadius:\s*\d/ },
  { name: "elevation", pattern: /elevation:/ },
  { name: "shadowColor", pattern: /shadowColor/ },
  { name: "fontSize", pattern: /fontSize:\s*\d/ },
  { name: "letterSpacing", pattern: /letterSpacing/ },
  { name: "textTransform", pattern: /textTransform/ },
  { name: "fontWeight", pattern: /fontWeight:\s*["']?\d/ },
  { name: "fontStyle", pattern: /fontStyle:/ },
  { name: "hexLiteral", pattern: /["'`]#[0-9a-fA-F]{3,8}["'`]/ },
  { name: "duration", pattern: /duration:\s*\d/ },
  { name: "easing", pattern: /Easing\.bezier/ }
] as const

const ALLOWLIST: Record<string, string[]> = allowlist

function sourceFiles(): string[] {
  const found: string[] = []

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(full)
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        found.push(path.relative(SRC, full))
      }
    }
  }

  ROOTS.forEach((root) => walk(path.join(SRC, root)))
  return found.sort()
}

function violations(file: string): string[] {
  const source = fs.readFileSync(path.join(SRC, file), "utf8")
  return RULES.filter((rule) => rule.pattern.test(source)).map((rule) => rule.name)
}

describe("design system guard", () => {
  const files = sourceFiles()

  it("scans every screen, feature component and util", () => {
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain("screens/DashboardScreen.tsx")
    expect(files).toContain("components/features/inspector/TrackMap.tsx")
    expect(files).toContain("utils/trips.ts")
  })

  // A guard whose patterns match nothing passes forever, so the shapes are pinned here
  // against both the literal a screen must not write and the token form it should.
  it("catches the literal shapes and lets the token forms through", () => {
    const caught = (source: string) => RULES.filter((rule) => rule.pattern.test(source)).map((rule) => rule.name)

    expect(caught('{ borderWidth: 1, borderRadius: 8, elevation: 4, shadowColor: "#000" }')).toEqual([
      "borderWidth",
      "borderRadius",
      "elevation",
      "shadowColor",
      "hexLiteral"
    ])
    expect(
      caught('{ fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "600", fontStyle: "italic" }')
    ).toEqual(["fontSize", "letterSpacing", "textTransform", "fontWeight", "fontStyle"])
    expect(caught("Animated.timing(v, { duration: 200, easing: Easing.bezier(0, 0, 0, 1) })")).toEqual([
      "duration",
      "easing"
    ])
    expect(
      caught("{ borderRadius: radius.sm, ...text.body, color: colors.primary, ...motion.enter, elevation }")
    ).toEqual([])
  })

  it("keeps screens out of the styling business", () => {
    const offenders = files
      .map((file) => ({ file, broken: violations(file).filter((rule) => !(ALLOWLIST[file] ?? []).includes(rule)) }))
      .filter((entry) => entry.broken.length > 0)
      .map((entry) => `${entry.file}: ${entry.broken.join(", ")}`)

    expect(offenders).toEqual([])
  })

  it("holds no allowlist entry the code has outgrown", () => {
    const stale = Object.entries(ALLOWLIST)
      .flatMap(([file, rules]) => {
        if (!files.includes(file)) return [`${file}: no longer scanned`]
        const live = violations(file)
        return rules.filter((rule) => !live.includes(rule)).map((rule) => `${file}: ${rule}`)
      })
      .sort()

    expect(stale).toEqual([])
  })
})
