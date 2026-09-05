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
} = require("path")

/**
 * A screen writing a number a constant already names forks the system quietly: it renders,
 * nothing fails, and the next change to that constant misses it.
 *
 * Every rule here fires only on a value that HAS a constant. A radius of 10 or an icon at 28
 * is not a violation, because nothing names those; they are numbers with no home, and rounding
 * them onto a scale would move the design rather than tidy it. That is why this file needs no
 * allowlist: the rules describe what the constants cover, so anything they flag is genuinely a
 * literal written in place of a name.
 *
 * Widening a scale means widening the matching rule here, or the new step goes unenforced.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components/features", "utils"]

const RULES = [
  { name: "spacing", pattern: /(?:padding|margin|gap|rowGap|columnGap)[A-Za-z]*:\s*(?:4|8|12|16|24|32)\b/ },
  { name: "radius", pattern: /borderRadius:\s*(?:4|8|12|16)\b/ },
  { name: "fontSize", pattern: /fontSize:\s*(?:10|11|12|13|14|15|16|18|20|24|28)\b/ },
  { name: "iconSize", pattern: /size=\{(?:16|20|24)\}/ }
] as const

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

  it("flags a value a constant names, and ignores one no constant covers", () => {
    const caught = (source: string) => RULES.filter((rule) => rule.pattern.test(source)).map((rule) => rule.name)

    expect(caught("{ padding: 16, borderRadius: 8, fontSize: 13 }")).toEqual(["spacing", "radius", "fontSize"])
    expect(caught("{ padding: space.lg, borderRadius: radius.sm, fontSize: fontSizes.description }")).toEqual([])
    expect(caught("<Icon size={20} />")).toEqual(["iconSize"])
    expect(caught("<Icon size={size.icon.md} />")).toEqual([])
    // No constant names these, so they are not drift and rounding them would move the design.
    expect(caught("{ padding: 10, marginTop: 20, borderRadius: 10 }")).toEqual([])
    expect(caught("<Icon size={28} />")).toEqual([])
  })

  it("keeps screens out of the styling business", () => {
    const offenders = files.map((file) => ({ file, found: violations(file) })).filter((e) => e.found.length > 0)

    expect(offenders).toEqual([])
  })
})
