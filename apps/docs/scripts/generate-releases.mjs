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
const feedOut = join(docsRoot, "static", "releases.xml")
const SITE = "https://colota.app"
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
  const changelog = join(changelogDir, `${code}.txt`)
  if (!existsSync(changelog)) {
    skipped.push(`${tag}: no changelog for versionCode ${code}`)
    continue
  }
  const iso = git("log", "-1", "--format=%aI", tag)
  byCode.set(code, { code, version, date: iso.slice(0, 10), iso, notes: readFileSync(changelog, "utf8").trim() })
}

// Newest first. Sorting by versionCode rather than version string avoids 1.10.0 < 1.9.0.
const entries = [...byCode.values()].sort((a, b) => b.code - a.code)

if (entries.length === 0) {
  throw new Error("No release tag matched a changelog, refusing to write an empty releases page.")
}

const compareUrl = (entry, i) => {
  const previous = entries[i + 1]
  return previous
    ? `${REPO}/compare/v${previous.version}...v${entry.version}`
    : `${REPO}/releases/tag/v${entry.version}`
}

const sections = entries.map((entry, i) => {
  const notes = entry.notes.replace(/([\\{}])/g, "\\$1")

  return [
    `## ${entry.version}`,
    ``,
    `*${entry.date}*`,
    ``,
    notes,
    ``,
    `**Full Changelog**: ${compareUrl(entry, i)}`,
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
  `Subscribe with the [RSS feed](pathname:///releases.xml).`,
  ``,
  sections.join("\n\n"),
  ``,
].join("\n")

writeFileSync(out, page)

// Docusaurus slugs "## 1.15.0" to "1150", and that anchor is the item guid.
const anchor = (version) => `${SITE}/releases#${version.replace(/\./g, "")}`
const xmlEscape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const items = entries.map((entry, i) => {
  const bullets = entry.notes
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `<li>${xmlEscape(line)}</li>`)
    .join("")
  const body = `<ul>${bullets}</ul><p><a href="${compareUrl(entry, i)}">Full changelog</a></p>`

  return [
    `    <item>`,
    `      <title>Colota ${entry.version}</title>`,
    `      <link>${anchor(entry.version)}</link>`,
    `      <guid isPermaLink="true">${anchor(entry.version)}</guid>`,
    `      <pubDate>${new Date(entry.iso).toUTCString()}</pubDate>`,
    `      <description>${xmlEscape(body)}</description>`,
    `    </item>`
  ].join("\n")
})

// Dated from the newest release, not the build clock, so a rebuild produces an identical file.
const feed = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
  `  <channel>`,
  `    <title>Colota Releases</title>`,
  `    <link>${SITE}/releases</link>`,
  `    <description>Release highlights for every published version of Colota.</description>`,
  `    <language>en</language>`,
  `    <lastBuildDate>${new Date(entries[0].iso).toUTCString()}</lastBuildDate>`,
  `    <atom:link href="${SITE}/releases.xml" rel="self" type="application/rss+xml" />`,
  ...items,
  `  </channel>`,
  `</rss>`,
  ``
].join("\n")

writeFileSync(feedOut, feed)
if (skipped.length) console.log(`Skipped ${skipped.length} tag(s):\n  ${skipped.join("\n  ")}`)
if (mistagged.length) {
  console.warn(`WARNING: ${mistagged.length} tag(s) missing from the page, retag to include them:\n  ${mistagged.join("\n  ")}`)
}
console.log(`Generated ${out} and ${feedOut} with ${entries.length} releases`)
