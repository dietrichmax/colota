// See designSystemGuard for why this file declares the node corner it needs by hand.
declare const __dirname: string

type Entry = { name: string; isDirectory: () => boolean }
const fs: {
  readdirSync: (dir: string, options: { withFileTypes: true }) => Entry[]
  readFileSync: (file: string, encoding: "utf8") => string
} = require("fs")
const path: { join: (...parts: string[]) => string } = require("path")

import { type, fontSizes } from "../styles/typography"

/**
 * A role is a size plus everything that always travels with it. Only the four sizes used at a
 * single weight across the app are roles: `body`, `description`, `caption`, `label`, `input`,
 * `small` and `micro` are each used at three or four weights, so a role for them would pick a
 * weight for call sites that disagree, which is a reflow rather than a rename.
 *
 * This walks the tree for a style that composes a role's exact combination by hand, because that
 * is how the app got here - two hundred styles writing size and weight separately, and a caption
 * rendered in nine different size, weight and line-height combinations.
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

/** A style body: every brace pair holding a fontSize and no nested object. */
function styleBodies(source: string): string[] {
  return [...source.matchAll(/\{([^{}]*fontSize[^{}]*)\}/g)].map((m) => m[1])
}

const ROLES: { role: string; size: keyof typeof fontSizes; weight?: string; mono?: boolean }[] = [
  { role: "display", size: "screenTitle", weight: "bold" },
  { role: "figure", size: "statValue", weight: "bold" },
  { role: "title", size: "cardTitle", weight: "bold" },
  { role: "heading", size: "heading", weight: "bold" },
  { role: "mono", size: "caption", mono: true }
]

describe("type role guard", () => {
  const files = sourceFiles()

  it("finds the styles it is meant to police", () => {
    const withText = files.filter((f) => styleBodies(fs.readFileSync(path.join(SRC, f), "utf8")).length > 0)

    expect(withText.length).toBeGreaterThan(40)
    expect(withText).toContain("components/ui/AppModal.tsx")
  })

  it("leaves no style composing a role by hand", () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const body of styleBodies(fs.readFileSync(path.join(SRC, file), "utf8"))) {
        for (const { role, size, weight, mono } of ROLES) {
          if (!new RegExp(`fontSize:\\s*fontSizes\\.${size}\\b`).test(body)) continue
          if (weight && !new RegExp(`\\.\\.\\.fonts\\.${weight}\\b`).test(body)) continue
          if (mono && !/fontFamily:\s*"monospace"/.test(body)) continue
          offenders.push(`${file} rebuilds type.${role}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it("keeps a figure tabular, so a counting number does not jitter", () => {
    expect(type.figure.fontVariant).toContain("tabular-nums")
  })

  it("keeps every role on the shared size scale, so one scale still governs", () => {
    const sizes: number[] = Object.values(fontSizes)

    for (const role of Object.values(type)) {
      expect(sizes).toContain(role.fontSize)
    }
  })
})
