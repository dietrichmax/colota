import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const docsRoot = join(here, "..")
const repoRoot = join(docsRoot, "..", "..")
const changelogDir = join(repoRoot, "fastlane", "metadata", "android", "en-US", "changelogs")
// A standalone page, not a doc: this is a changelog, and it mirrors src/pages/privacy-policy.md.
const out = join(docsRoot, "src", "pages", "releases.md")
const REPO = "https://github.com/dietrichmax/colota"
const GRADLE = "apps/mobile/android/app/build.gradle"

const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim()

let tags
try {
  tags = git("tag", "--list").split("\n").map((t) => t.trim())
} catch {
  throw new Error(`Cannot read git tags, which the releases page is derived from. CI needs fetch-depth: 0.`)
}

// Release tags only: drops the rc tags and the floating "latest".
const parts = (tag) => tag.slice(1).split(".").map(Number)
const releases = tags
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
  .sort((a, b) => {
    const [x, y] = [parts(a), parts(b)]
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]
  })

// A release is shown when its tagged versionCode has a changelog file, so an unreleased build
// stays off the page until it is tagged, and the page cannot drift from what actually shipped.
const byCode = new Map()
const skipped = []
const mistagged = []
for (const tag of releases) {
  const version = tag.slice(1)
  let gradle
  try {
    gradle = git("show", `${tag}:${GRADLE}`)
  } catch {
    skipped.push(`${tag}: no ${GRADLE}`)
    continue
  }
  // A tag placed before its own release commit still carries the previous version, and would
  // otherwise claim that release's versionCode and overwrite it. Trust neither half unless
  // versionName agrees with the tag.
  const name = gradle.match(/versionName\s+"([^"]+)"/)?.[1]
  if (name !== version) {
    mistagged.push(`${tag} points at a commit declaring ${name ?? "no versionName"}`)
    continue
  }
  const code = Number(gradle.match(/versionCode\s+(\d+)/)[1])
  if (!existsSync(join(changelogDir, `${code}.txt`))) {
    skipped.push(`${tag}: no changelog for versionCode ${code}`)
    continue
  }
  byCode.set(code, { code, version, date: git("log", "-1", "--format=%as", tag) })
}

// Newest first. Sorting by versionCode rather than version string avoids 1.10.0 < 1.9.0.
const entries = [...byCode.values()].sort((a, b) => b.code - a.code)

if (entries.length === 0) {
  throw new Error("No release tag matched a changelog, refusing to write an empty releases page.")
}

const sections = entries.map((entry, i) => {
  // Docusaurus parses .md as MDX, so braces in changelog text (placeholders such as
  // {date}) would be evaluated as JSX expressions. Backslash-escape them.
  const notes = readFileSync(join(changelogDir, `${entry.code}.txt`), "utf8").trim().replace(/([{}])/g, "\\$1")
  const previous = entries[i + 1]
  const compare = previous
    ? `${REPO}/compare/v${previous.version}...v${entry.version}`
    : `${REPO}/releases/tag/v${entry.version}`

  return [
    `## ${entry.version}`,
    ``,
    `*${entry.date}*`,
    ``,
    notes,
    ``,
    `**Full Changelog**: ${compare}`,
  ].join("\n")
})

const page = [
  `---`,
  `title: Releases`,
  `description: Release highlights for every published version of Colota.`,
  `---`,
  ``,
  `# Releases`,
  ``,
  `Highlights for each published version, the same notes shown in Google Play and F-Droid.`,
  `Every entry links to the full commit range on GitHub.`,
  ``,
  sections.join("\n\n"),
  ``,
].join("\n")

writeFileSync(out, page)
if (skipped.length) console.log(`Skipped ${skipped.length} tag(s):\n  ${skipped.join("\n  ")}`)
if (mistagged.length) {
  console.warn(`WARNING: ${mistagged.length} tag(s) missing from the page, retag to include them:\n  ${mistagged.join("\n  ")}`)
}
console.log(`Generated ${out} with ${entries.length} releases`)
