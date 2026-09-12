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
 * `Button` and `TextField` put a caller's `style` on their outer view and paint the control inside
 * it, so a fill, corner or border passed from a screen lands on a transparent box and is never
 * drawn. It cost four inputs a double border and left the Start control at the default corner while
 * its own style said otherwise. Layout is fine to pass; paint is not.
 */
const SRC = path.join(__dirname, "..")
const ROOTS = ["screens", "components"]
const WRAPPERS = ["Button", "TextField"]
const PAINT = /\b(backgroundColor|borderRadius|borderWidth|borderColor)\s*:/

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

function styleBodies(source: string): Record<string, string> {
  const bodies: Record<string, string> = {}
  for (const style of source.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) bodies[style[1]] = style[2]
  return bodies
}

function stylesHandedToAWrapper(source: string): string[] {
  const names: string[] = []
  for (const wrapper of WRAPPERS) {
    const tag = new RegExp(`<${wrapper}\\b[^>]*?style=\\{styles\\.(\\w+)\\}`, "gs")
    for (const use of source.matchAll(tag)) names.push(use[1])
  }
  return names
}

describe("wrapper style guard", () => {
  const files = sourceFiles()

  it("finds the callers it is meant to police", () => {
    const callers = files.filter((f) => stylesHandedToAWrapper(fs.readFileSync(path.join(SRC, f), "utf8")).length > 0)

    expect(callers).toContain("components/features/settings/MtlsSection.tsx")
    expect(callers).toContain("screens/ProfileEditorScreen.tsx")
  })

  it("hands a wrapper layout only, because paint on it is never drawn", () => {
    const painted: string[] = []

    for (const file of files) {
      const source = fs.readFileSync(path.join(SRC, file), "utf8")
      const bodies = styleBodies(source)
      for (const name of stylesHandedToAWrapper(source)) {
        const body = bodies[name]
        if (body && PAINT.test(body)) painted.push(`${file}: ${name} sets ${body.match(PAINT)![1]}`)
      }
    }

    expect(painted).toEqual([])
  })
})
