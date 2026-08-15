import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const docsRoot = join(here, "..")
const repoRoot = join(docsRoot, "..", "..")
const changelogDir = join(repoRoot, "fastlane", "metadata", "android", "en-US", "changelogs")
// A standalone page, not a doc: this is a changelog, and it mirrors src/pages/privacy-policy.md.
const out = join(docsRoot, "src", "pages", "releases.md")
const REPO = "https://github.com/dietrichmax/colota"

const releases = JSON.parse(readFileSync(join(docsRoot, "releases.json"), "utf8"))

// Newest first. Sorting by versionCode rather than version string avoids 1.10.0 < 1.9.0.
const entries = Object.entries(releases)
  .filter(([code]) => code !== "//")
  .map(([code, meta]) => ({ code: Number(code), ...meta }))
  .sort((a, b) => b.code - a.code)

const sections = entries.map((entry, i) => {
  const file = join(changelogDir, `${entry.code}.txt`)
  if (!existsSync(file)) {
    throw new Error(`releases.json lists ${entry.version} (code ${entry.code}) but ${file} is missing`)
  }
  // Docusaurus parses .md as MDX, so braces in changelog text (placeholders such as
  // {date}) would be evaluated as JSX expressions. Backslash-escape them.
  const notes = readFileSync(file, "utf8").trim().replace(/([{}])/g, "\\$1")
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
console.log(`Generated ${out} with ${entries.length} releases`)
