/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// Checks the built site in public/: every internal link reaches a file and every #anchor an id on its page.
// Then checks assets/css/site.css: colours and spacing come from tokens.css, never a literal; 0 and the 1px hairline are legal.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = join(docsRoot, "public")
const problems = []

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : name.endsWith(".html") ? [full] : []
  })

const target = (path) => {
  const file = join(publicDir, decodeURIComponent(path))
  if (existsSync(file) && statSync(file).isFile()) return file
  const index = join(file, "index.html")
  return existsSync(index) ? index : null
}

const ids = new Map()
const idsOf = (file) => {
  if (!ids.has(file))
    ids.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\sid="?([^"\s>]+)"?/g)].map((m) => m[1])))
  return ids.get(file)
}

for (const file of walk(publicDir)) {
  const html = readFileSync(file, "utf8")
  if (/http-equiv="?refresh/.test(html)) continue
  const page = "/" + relative(publicDir, file).replace(/index\.html$/, "")
  for (const [, raw] of html.matchAll(/<a\s[^>]*?href="?([^"\s>]+)"?/g)) {
    const href = raw.replace(/&amp;/g, "&")
    if (/^[a-z]+:/i.test(href)) continue
    const url = new URL(href, `https://colota.app${page}`)
    const dest = url.pathname === page && href.startsWith("#") ? file : target(url.pathname)
    if (!dest) {
      problems.push(`${page}: ${href} leads to no file`)
      continue
    }
    const anchor = decodeURIComponent(url.hash.slice(1))
    if (anchor && dest.endsWith(".html") && !idsOf(dest).has(anchor))
      problems.push(`${page}: ${href} names no id on its page`)
  }
}

const css = readFileSync(join(docsRoot, "assets", "css", "site.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
for (const [, prop, value] of css.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)/g)) {
  if (prop.startsWith("--")) continue
  if (/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla)\(/i.test(value))
    problems.push(`site.css: ${prop}: ${value.trim()} is a colour literal, use a token`)
  if (
    /^(padding|margin|gap|row-gap|column-gap|border-radius|font-size)/.test(prop) &&
    (value.match(/\d+(\.\d+)?px/g) ?? []).some((n) => n !== "0px" && n !== "1px")
  ) {
    problems.push(`site.css: ${prop}: ${value.trim()} is a pixel literal, use a token`)
  }
}

if (problems.length) {
  console.error(problems.join("\n"))
  process.exit(1)
}
console.log("Links, anchors and CSS tokens check out.")
