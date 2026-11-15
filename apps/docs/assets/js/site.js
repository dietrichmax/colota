/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

const root = document.documentElement
const darkScheme = matchMedia("(prefers-color-scheme: dark)")
const isDark = () => root.dataset.theme === "dark" || (!root.dataset.theme && darkScheme.matches)

// A <source data-dark-source> follows the system theme by its media query; a theme chosen in the header overrides it.
function syncDarkSources() {
  const media = { dark: "all", light: "not all" }[root.dataset.theme] ?? "(prefers-color-scheme: dark)"
  for (const source of document.querySelectorAll("source[data-dark-source]")) source.media = media
}

function initTheme() {
  syncDarkSources()
  for (const button of document.querySelectorAll("[data-theme-toggle]")) {
    button.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark"
      root.dataset.theme = next
      syncDarkSources()
      try {
        localStorage.setItem("theme", next)
      } catch {}
    })
  }
}

function initLightbox() {
  const dialog = document.querySelector("[data-lightbox]")
  if (!dialog) return
  const img = dialog.querySelector("[data-lightbox-img]")
  const label = dialog.querySelector("[data-lightbox-label]")
  const count = dialog.querySelector("[data-lightbox-count]")
  let items = []
  let index = 0

  const show = (i) => {
    index = (i + items.length) % items.length
    const item = items[index]
    img.src = (isDark() && item.dataset.srcDark) || item.dataset.src
    img.alt = item.dataset.label
    label.textContent = item.dataset.label
    count.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : ""
    dialog.classList.toggle("single", items.length < 2)
  }

  for (const gallery of document.querySelectorAll("[data-gallery]")) {
    const own = [...gallery.querySelectorAll(".gallery-item")]
    own.forEach((item, i) =>
      item.addEventListener("click", () => {
        items = own
        show(i)
        dialog.showModal()
      })
    )
  }
  dialog.querySelector("[data-lightbox-prev]").addEventListener("click", () => show(index - 1))
  dialog.querySelector("[data-lightbox-next]").addEventListener("click", () => show(index + 1))
  dialog.querySelector("[data-lightbox-close]").addEventListener("click", () => dialog.close())
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(index - 1)
    if (event.key === "ArrowRight") show(index + 1)
  })
}

function initOutline() {
  const outline = document.querySelector("[data-outline]")
  if (!outline || !("IntersectionObserver" in window)) return
  const links = new Map([...outline.querySelectorAll("a")].map((a) => [decodeURIComponent(a.hash.slice(1)), a]))
  const headings = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean)
  const visible = new Set()
  const mark = () => {
    const current =
      headings.find((h) => visible.has(h)) ?? headings.filter((h) => h.getBoundingClientRect().top < 0).pop()
    for (const a of links.values()) a.classList.remove("on")
    if (current) links.get(current.id)?.classList.add("on")
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)
      mark()
    },
    { rootMargin: "-64px 0px -60% 0px" }
  )
  headings.forEach((h) => observer.observe(h))
}

function initCopy() {
  for (const pre of document.querySelectorAll(".prose pre")) {
    let wrap = pre.parentElement
    if (!wrap.classList.contains("highlight")) {
      wrap = document.createElement("div")
      wrap.className = "highlight"
      pre.before(wrap)
      wrap.append(pre)
    }
    const button = document.createElement("button")
    button.type = "button"
    button.className = "copy"
    button.textContent = "Copy"
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText.replace(/\n$/, ""))
        button.textContent = "Copied"
      } catch {
        button.textContent = "Select and copy"
      }
      setTimeout(() => (button.textContent = "Copy"), 1500)
    })
    wrap.append(button)
  }
}

initTheme()
initLightbox()
initOutline()
initCopy()
