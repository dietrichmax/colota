/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// The colota://setup link generator. The form is the state: every change reads it back and rebuilds the link.
import { encode } from "./vendor/uqr.mjs"
import {
  API_TEMPLATE_NAMES,
  AUTH_TYPES,
  DAWARICH_MODES,
  HTTP_METHODS,
  OVERLAND_BATCH_MAX,
  OVERLAND_BATCH_MIN,
  SYNC_CONDITIONS,
  buildSetupLinkFromConfig
} from "../shared/setupSchema.ts"
import {
  ACCURACY_MODE_LABELS,
  PROFILE_CONDITION_LABELS,
  QR_MAX_SCANNABLE_LENGTH,
  buildConfig,
  newGeofence,
  newProfile
} from "./setup-config.js"

let uid = 0

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue
    if (name.startsWith("on")) el.addEventListener(name.slice(2), value)
    else if (name === "checked" || name === "value") el[name] = value
    else el.setAttribute(name, value === true ? "" : value)
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false))
  return el
}

const NOT_SET = ["", "-- not set --"]
const BOOL = [NOT_SET, ["true", "Enabled"], ["false", "Disabled"]]
const plain = (values) => values.map((v) => [v, v])

function control(kind, key, attrs = {}) {
  const id = `gen-${++uid}`
  if (kind === "select") {
    return h(
      "select",
      { class: "gen-input", id, "data-key": key },
      attrs.options.map(([value, label]) => h("option", { value }, label))
    )
  }
  return h("input", { class: "gen-input", id, "data-key": key, ...attrs })
}

function field(label, el, show) {
  return h("div", { class: "gen-field", "data-show": show }, h("label", { for: el.id }, label), el)
}

const text = (label, key, attrs, show) => field(label, control("input", key, attrs), show)
const choice = (label, key, options, show) => field(label, control("select", key, { options }), show)
const row = (...fields) => h("div", { class: "gen-row" }, fields)
const section = (title, ...children) => h("section", { class: "gen-section" }, h("h3", {}, title), children)

function removeButton(label) {
  return h(
    "button",
    {
      type: "button",
      class: "gen-remove",
      "aria-label": label,
      onclick: (e) => (e.currentTarget.closest("[data-item]").remove(), update())
    },
    "×"
  )
}

function keyValueList(list, keyPlaceholder, valuePlaceholder, addLabel) {
  const items = h("div", { class: "gen-list", "data-list": list })
  const add = () => {
    items.append(
      h(
        "div",
        { class: "gen-kv", "data-item": "" },
        h("input", {
          class: "gen-input",
          "data-field": "key",
          placeholder: keyPlaceholder,
          "aria-label": keyPlaceholder
        }),
        h("input", {
          class: "gen-input",
          "data-field": "value",
          placeholder: valuePlaceholder,
          "aria-label": valuePlaceholder
        }),
        removeButton("Remove")
      )
    )
    update()
  }
  return [items, h("button", { type: "button", class: "gen-add", onclick: add }, addLabel)]
}

function itemField(label, name, attrs, show) {
  const el = h("input", { class: "gen-input", id: `gen-${++uid}`, "data-field": name, ...attrs })
  return field(label, el, show)
}

function itemCheck(label, name, checked) {
  return h("label", { class: "gen-check" }, h("input", { type: "checkbox", "data-field": name, checked }), label)
}

function geofenceCard() {
  const g = newGeofence()
  return h(
    "div",
    { class: "gen-card", "data-item": "" },
    row(
      itemField("Name", "name", { placeholder: "Home", value: g.name }),
      itemField("Radius (m)", "radius", { type: "number", min: "1", placeholder: "100" })
    ),
    row(
      itemField("Latitude", "lat", { type: "number", step: "any", placeholder: "52.52" }),
      itemField("Longitude", "lon", { type: "number", step: "any", placeholder: "13.405" })
    ),
    h(
      "div",
      { class: "gen-flags" },
      itemCheck("Pause tracking", "pauseTracking", g.pauseTracking),
      itemCheck("Pause on Wi-Fi", "pauseOnWifi", g.pauseOnWifi)
    ),
    h(
      "div",
      { class: "gen-flags" },
      itemCheck("Pause when motionless", "pauseOnMotionless", g.pauseOnMotionless),
      h("input", {
        class: "gen-input",
        type: "number",
        min: "1",
        "data-field": "motionlessTimeoutMinutes",
        "data-show": "motionless",
        placeholder: "Timeout in min (default 10)",
        "aria-label": "Motionless timeout in minutes"
      })
    ),
    h(
      "div",
      { class: "gen-flags" },
      itemCheck("Stationary heartbeat", "heartbeatEnabled", g.heartbeatEnabled),
      h("input", {
        class: "gen-input",
        type: "number",
        min: "1",
        "data-field": "heartbeatIntervalMinutes",
        "data-show": "heartbeat",
        placeholder: "Interval in min (default 15)",
        "aria-label": "Heartbeat interval in minutes"
      })
    ),
    h("div", { class: "gen-card-end" }, removeButton("Remove geofence"))
  )
}

function profileCard() {
  const p = newProfile()
  const condition = h(
    "select",
    { class: "gen-input", id: `gen-${++uid}`, "data-field": "conditionType" },
    Object.entries(PROFILE_CONDITION_LABELS).map(([value, label]) => h("option", { value }, label))
  )
  condition.value = p.conditionType
  return h(
    "div",
    { class: "gen-card", "data-item": "" },
    row(
      itemField("Name", "name", { placeholder: "Driving" }),
      itemField("Priority", "priority", { type: "number", min: "0", placeholder: "10", value: p.priority })
    ),
    row(
      field("Condition", condition),
      itemField("Speed threshold (km/h)", "speedKmh", { type: "number", min: "1", placeholder: "30" }, "speed"),
      itemField("Wi-Fi SSID", "ssid", { placeholder: "MyNetwork" }, "ssid")
    ),
    row(
      itemField("Interval (sec)", "interval", { type: "number", min: "1", placeholder: "5", value: p.interval }),
      itemField("Distance (m)", "distance", { type: "number", min: "0", placeholder: "0", value: p.distance })
    ),
    row(
      itemField("Sync interval (sec)", "syncInterval", {
        type: "number",
        min: "0",
        placeholder: "0",
        value: p.syncInterval
      }),
      itemField(
        "Activation delay (sec)",
        "activationDelay",
        { type: "number", min: "0", placeholder: "0", value: p.activationDelay },
        "delays"
      ),
      itemField(
        "Deactivation delay (sec)",
        "deactivationDelay",
        { type: "number", min: "0", placeholder: "60", value: p.deactivationDelay },
        "delays"
      ),
      itemField("Accuracy filter (m)", "accuracyThreshold", {
        type: "number",
        min: "1",
        placeholder: "Tracking & sync"
      })
    ),
    h("div", { class: "gen-flags" }, itemCheck("Enabled on import", "enabled", p.enabled)),
    h("div", { class: "gen-card-end" }, removeButton("Remove profile"))
  )
}

function cardList(list, make, addLabel) {
  const items = h("div", { class: "gen-list", "data-list": list })
  return [
    items,
    h("button", { type: "button", class: "gen-add", onclick: () => (items.append(make()), update()) }, addLabel)
  ]
}

const root = document.querySelector("[data-deep-link-generator]")
const output = h("div", { class: "gen-output", "aria-live": "polite" })

root.append(
  section(
    "Connection",
    text("Endpoint URL", "endpoint", { type: "url", placeholder: "https://my-server.com/api/locations" }),
    row(
      choice("API Template", "apiTemplate", [NOT_SET, ...plain(API_TEMPLATE_NAMES)]),
      choice("HTTP Method", "httpMethod", [NOT_SET, ...plain(HTTP_METHODS)])
    ),
    row(choice("Dawarich Mode", "dawarichMode", [NOT_SET, ...plain(DAWARICH_MODES)], "dawarich")),
    row(
      text(
        `Batch size (${OVERLAND_BATCH_MIN}-${OVERLAND_BATCH_MAX})`,
        "overlandBatchSize",
        { type: "number", min: OVERLAND_BATCH_MIN, max: OVERLAND_BATCH_MAX, placeholder: "50" },
        "batch"
      )
    ),
    row(choice("Current geofences", "sendInRegions", BOOL), choice("Enter and leave events", "sendTransitions", BOOL))
  ),
  section(
    "Tracking",
    row(
      text("Interval (seconds)", "interval", { type: "number", min: "1", placeholder: "e.g. 10" }),
      text("Distance (meters)", "distance", { type: "number", min: "0", placeholder: "e.g. 5" })
    ),
    row(
      text("Accuracy threshold (meters)", "accuracyThreshold", { type: "number", min: "0", placeholder: "e.g. 50" }),
      choice("Filter inaccurate locations", "filterInaccurateLocations", BOOL)
    ),
    row(choice("Positioning accuracy", "accuracyMode", [NOT_SET, ...Object.entries(ACCURACY_MODE_LABELS)]))
  ),
  section(
    "Sync",
    row(
      text("Sync interval (seconds)", "syncInterval", { type: "number", min: "0", placeholder: "0 = instant" }),
      choice("Offline mode", "isOfflineMode", BOOL)
    ),
    row(
      choice("Sync condition", "syncCondition", [NOT_SET, ...plain(SYNC_CONDITIONS)]),
      text("Wi-Fi SSID", "syncSsid", { placeholder: "MyNetwork" }, "syncSsid")
    )
  ),
  section(
    "Authentication",
    choice("Auth type", "authType", [NOT_SET, ...plain(AUTH_TYPES)]),
    row(text("Username", "authUsername", {}, "basic"), text("Password", "authPassword", { type: "password" }, "basic")),
    text("Bearer token", "authBearerToken", { type: "password", placeholder: "my-secret-token" }, "bearer")
  ),
  section("Custom Headers", keyValueList("customHeaders", "Header name", "Value", "+ Add header")),
  section("Custom Fields", keyValueList("customFields", "Key", "Value", "+ Add field")),
  section("Field Map", keyValueList("fieldMapEntries", "Source field (e.g. lat)", "Mapped name", "+ Add mapping")),
  section("Geofences", cardList("geofences", geofenceCard, "+ Add geofence")),
  section("Tracking Profiles", cardList("profiles", profileCard, "+ Add profile")),
  h("hr", { class: "gen-divider" }),
  output
)

const value = (key) => root.querySelector(`[data-key="${key}"]`).value

function items(list) {
  return [...root.querySelectorAll(`[data-list="${list}"] > [data-item]`)].map((item) => {
    const entry = {}
    for (const el of item.querySelectorAll("[data-field]"))
      entry[el.dataset.field] = el.type === "checkbox" ? el.checked : el.value
    return entry
  })
}

function read() {
  const keys = [...root.querySelectorAll("[data-key]")].map((el) => el.dataset.key)
  const state = Object.fromEntries(keys.map((key) => [key, value(key)]))
  for (const list of ["fieldMapEntries", "customFields", "customHeaders", "geofences", "profiles"])
    state[list] = items(list)
  return state
}

function visibility(state) {
  const shown = {
    dawarich: state.apiTemplate === "dawarich",
    batch: state.apiTemplate === "overland" || (state.apiTemplate === "dawarich" && state.dawarichMode === "batch"),
    syncSsid: state.syncCondition === "wifi_ssid",
    basic: state.authType === "basic",
    bearer: state.authType === "bearer"
  }
  for (const el of root.querySelectorAll(".gen-section > [data-show], .gen-section > .gen-row > [data-show]"))
    el.hidden = !shown[el.dataset.show]
  for (const card of root.querySelectorAll('[data-list="geofences"] > [data-item]')) {
    card.querySelector('[data-show="motionless"]').hidden = !card.querySelector('[data-field="pauseOnMotionless"]')
      .checked
    card.querySelector('[data-show="heartbeat"]').hidden = !card.querySelector('[data-field="heartbeatEnabled"]')
      .checked
  }
  for (const card of root.querySelectorAll('[data-list="profiles"] > [data-item]')) {
    const type = card.querySelector('[data-field="conditionType"]').value
    for (const el of card.querySelectorAll('[data-show="speed"]'))
      el.hidden = type !== "speed_above" && type !== "speed_below"
    for (const el of card.querySelectorAll('[data-show="ssid"]')) el.hidden = type !== "wifi_ssid"
    for (const el of card.querySelectorAll('[data-show="delays"]')) el.hidden = type === "stationary"
  }
}

function qrSvg(link) {
  const { size, data } = encode(link, { ecc: "L", border: 2 })
  let d = ""
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y][x]) d += `M${x},${y}h1v1h-1z`
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`)
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", "QR code of the setup link")
  const bg = document.createElementNS(ns, "rect")
  bg.setAttribute("fill", "white")
  bg.setAttribute("width", size)
  bg.setAttribute("height", size)
  const path = document.createElementNS(ns, "path")
  path.setAttribute("fill", "black")
  path.setAttribute("d", d)
  svg.append(bg, path)
  return svg
}

function flash(button, done, idle) {
  button.textContent = done
  setTimeout(() => (button.textContent = idle), 2000)
}

function update() {
  const state = read()
  visibility(state)
  const config = buildConfig(state)
  if (Object.keys(config).length === 0) {
    output.replaceChildren(h("p", { class: "gen-empty" }, "Fill in at least one field above to generate a setup link."))
    return
  }
  const link = buildSetupLinkFromConfig(config)
  const copy = h("button", { type: "button", class: "gen-primary" }, "Copy link")
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link)
      flash(copy, "Copied!", "Copy link")
    } catch {
      flash(copy, "Select the link and copy it", "Copy link")
    }
  })
  const download = h("button", { type: "button", class: "gen-secondary" }, "Download JSON")
  download.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }))
    h("a", { href: url, download: "colota-config.json" }).click()
    URL.revokeObjectURL(url)
    flash(download, "Downloaded!", "Download JSON")
  })
  output.replaceChildren(
    h("h3", {}, "Generated Link"),
    h("div", { class: "gen-link" }, link),
    h("div", { class: "gen-actions" }, copy, download),
    h("h3", {}, "QR Code"),
    h("div", { class: "gen-qr" }, qrSvg(link)),
    link.length > QR_MAX_SCANNABLE_LENGTH &&
      h(
        "div",
        { class: "gen-warning" },
        h("strong", {}, "This QR code may not be readable on all phones."),
        " The configuration is large, so the QR has dense modules. If scanning fails, use the Copy link or Download JSON button above instead."
      )
  )
}

root.addEventListener("input", update)
root.addEventListener("change", update)
update()
