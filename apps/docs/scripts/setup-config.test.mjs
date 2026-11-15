/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  ACCURACY_MODES,
  PROFILE_CONDITION_TYPES,
  buildSetupLinkFromConfig,
  decodeConfig
} from "../../../packages/shared/src/setupSchema.ts"
import {
  ACCURACY_MODE_LABELS,
  PROFILE_CONDITION_LABELS,
  buildConfig,
  newGeofence,
  newProfile
} from "../assets/js/setup-config.js"

const empty = () => ({ fieldMapEntries: [], customFields: [], customHeaders: [], geofences: [], profiles: [] })
const profile = (fields) => buildConfig({ ...empty(), profiles: [{ ...newProfile(), name: "P", ...fields }] }).profiles

test("every condition a link may carry has a label, so a new one cannot be missing from the generator", () => {
  const linkable = PROFILE_CONDITION_TYPES.filter((type) => type !== "bluetooth_device")
  assert.deepEqual(Object.keys(PROFILE_CONDITION_LABELS).sort(), [...linkable].sort())
  assert.deepEqual(Object.keys(ACCURACY_MODE_LABELS).sort(), [...ACCURACY_MODES].sort())
})

test("an untouched form produces no config, so no link is offered", () => {
  assert.deepEqual(buildConfig({ ...empty(), endpoint: "" }), {})
})

test("the speed threshold is typed in km/h and sent in m/s, the unit the app compares against", () => {
  assert.equal(profile({ conditionType: "speed_above", speedKmh: "36" })[0].condition.speedThreshold, 10)
})

test("a stationary profile leaves out both delays so the app applies its own", () => {
  const [entry] = profile({ conditionType: "stationary" })
  assert.equal("activationDelay" in entry, false)
  assert.equal("deactivationDelay" in entry, false)
})

test("a profile missing a value its condition needs is left out instead of sent half filled", () => {
  assert.equal(profile({ conditionType: "wifi_ssid", ssid: "  " }), undefined)
  assert.equal(profile({ conditionType: "speed_below", speedKmh: "" }), undefined)
})

test("a geofence without a positive radius is left out", () => {
  const geofence = { ...newGeofence(), name: "Home", lat: "52.5", lon: "13.4", radius: "0" }
  assert.equal(buildConfig({ ...empty(), geofences: [geofence] }).geofences, undefined)
})

test("the link decodes back to the config the form shows", () => {
  const config = buildConfig({
    ...empty(),
    endpoint: "https://example.org/api",
    authType: "bearer",
    authBearerToken: "t"
  })
  assert.deepEqual(decodeConfig(new URL(buildSetupLinkFromConfig(config)).searchParams.get("config")), config)
})
