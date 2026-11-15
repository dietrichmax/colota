/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// Site search over the Pagefind index the build writes to /pagefind/. Everything runs in the browser.
const dialog = document.querySelector("[data-search]")
const input = dialog?.querySelector("[data-search-input]")
const list = dialog?.querySelector("[data-search-results]")
const MAX_RESULTS = 8

let pagefind = null
let latest = 0

async function load() {
  if (pagefind) return pagefind
  const url = "/pagefind/pagefind.js"
  pagefind = await import(url)
  await pagefind.options({ excerptLength: 18 })
  return pagefind
}

function message(text) {
  const p = document.createElement("p")
  p.className = "search-message"
  p.textContent = text
  list.replaceChildren(p)
}

function row(result) {
  const sub = result.sub_results?.[0]
  const a = document.createElement("a")
  a.className = "row search-row"
  a.href = sub?.url ?? result.url
  const text = document.createElement("span")
  text.className = "row-text"
  const label = document.createElement("span")
  label.className = "row-label"
  label.textContent = sub && sub.title !== result.meta.title ? `${result.meta.title} › ${sub.title}` : result.meta.title
  const meta = document.createElement("span")
  meta.className = "row-group"
  meta.textContent = result.meta.group ?? ""
  const excerpt = document.createElement("span")
  excerpt.className = "row-sub search-excerpt"
  // Pagefind's excerpt is text from our own pages with the matches wrapped in <mark>.
  excerpt.innerHTML = sub?.excerpt ?? result.excerpt
  text.append(meta, label, excerpt)
  a.append(text)
  return a
}

async function run(query) {
  const id = ++latest
  if (!query.trim()) {
    message("Type to search the docs.")
    return
  }
  let found
  try {
    const index = await load()
    found = await index.debouncedSearch(query, {}, 150)
  } catch {
    message("Search needs the built site: run npm run preview -w @colota/docs.")
    return
  }
  if (found === null || id !== latest) return
  if (!found.results.length) {
    message(`Nothing matches "${query}".`)
    return
  }
  const results = await Promise.all(found.results.slice(0, MAX_RESULTS).map((r) => r.data()))
  if (id !== latest) return
  const card = document.createElement("div")
  card.className = "card rows"
  results.forEach((result, i) => {
    if (i) {
      const divider = document.createElement("div")
      divider.className = "divider"
      card.append(divider)
    }
    card.append(row(result))
  })
  list.replaceChildren(card)
}

function open() {
  if (dialog.open) return
  dialog.showModal()
  input.select()
  run(input.value)
}

if (dialog) {
  for (const button of document.querySelectorAll("[data-search-open]")) button.addEventListener("click", open)
  dialog.querySelector("[data-search-close]").addEventListener("click", () => dialog.close())
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close()
  })
  input.addEventListener("input", () => run(input.value))
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") list.querySelector("a")?.click()
  })
  document.addEventListener("keydown", (event) => {
    const typing = event.target.closest?.("input, textarea, select, [contenteditable]")
    if ((event.key === "/" && !typing) || (event.key === "k" && (event.ctrlKey || event.metaKey))) {
      event.preventDefault()
      open()
    }
  })
}
