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
 * Most rules here fire only on a value that HAS a constant. A radius of 10 or an icon at 28 is not
 * a violation, because nothing names those; they are numbers with no home, and rounding them onto a
 * scale would move the design rather than tidy it. That is why this file needs no allowlist: the
 * rules describe what the constants cover, so anything they flag is genuinely a literal written in
 * place of a name.
 *
 * Spacing is the exception, and it is the stronger form. `space` now names every step it uses, so
 * the rule is inverted there: any number at all is drift. That closes the gap the value-list rules
 * cannot see, which is where every guard added after this one found its defect.
 *
 * Widening a scale means widening the matching rule here, or the new step goes unenforced.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components/features", "components/ui", "utils"]

const RULES = [
  // Spacing is the one scale with no holes: every step from 2 to 32 has a name, so any number
  // here is a literal. 0 is not a spacing value, it cancels one, and stays legal.
  { name: "spacing", pattern: /(?:padding|margin|gap|rowGap|columnGap)[A-Za-z]*:\s*-?(?!0\b)\d/ },
  // A literal hides just as well behind an operator: `insets.bottom + 8` is the same drift.
  { name: "spacingExpression", pattern: /(?:padding|margin|gap|rowGap|columnGap)[A-Za-z]*:[^,\n}]*[-+*/]\s*\d/ },
  { name: "radius", pattern: /borderRadius:\s*(?:4|8|12|16)\b/ },
  { name: "fontSize", pattern: /fontSize:\s*(?:10|11|12|13|14|15|16|18|20|24|28)\b/ },
  { name: "iconSize", pattern: /size=\{(?:16|20|24)\}/ },
  // These three ban a property outright rather than a value, because the scale covers every case:
  // elevation names its four levels, fonts names its four weights, and the type spec has no
  // letter spacing at all.
  { name: "elevation", pattern: /elevation:\s*\d/ },
  { name: "fontWeight", pattern: /fontWeight:\s*"?\d/ },
  { name: "letterSpacing", pattern: /letterSpacing:/ },
  // Touch feedback is a ripple. A fade is the iOS idiom and dims the label with the surface,
  // so it is banned outright rather than by value; the pressedOpacity token is gone with it.
  { name: "pressOpacity", pattern: /pressed[^)]*&&[^}]*opacity/ }
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
    expect(caught("{ borderRadius: 10 }")).toEqual([])
    expect(caught("<Icon size={28} />")).toEqual([])
  })

  it("flags any spacing number, because space has a name for every step it uses", () => {
    const caught = (source: string) => RULES.filter((rule) => rule.pattern.test(source)).map((rule) => rule.name)

    // The three the value list could never see: between two steps, below the grid, and behind a plus.
    expect(caught("{ marginTop: 20 }")).toEqual(["spacing"])
    expect(caught("{ gap: 3 }")).toEqual(["spacing"])
    expect(caught("{ paddingBottom: insets.bottom + 8 }")).toEqual(["spacingExpression"])
    // 0 cancels a spacing value rather than setting one, and a token composes freely.
    expect(caught("{ paddingHorizontal: 0 }")).toEqual([])
    expect(caught("{ marginHorizontal: -space.lg }")).toEqual([])
    expect(caught("{ paddingHorizontal: FIELD_INSET - borderWidth }")).toEqual([])
  })

  it("flags a press that fades instead of rippling", () => {
    const caught = (source: string) => RULES.filter((rule) => rule.pattern.test(source)).map((rule) => rule.name)

    expect(caught("style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}")).toEqual(["pressOpacity"])
    expect(caught("android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}")).toEqual([])
  })

  it("keeps screens out of the styling business", () => {
    const offenders = files.map((file) => ({ file, found: violations(file) })).filter((e) => e.found.length > 0)

    expect(offenders).toEqual([])
  })
})
