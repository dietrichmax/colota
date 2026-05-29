import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { loadTargets } from "../src/targets"

function clearTargetEnv() {
  for (const k of Object.keys(process.env)) if (k.startsWith("TARGET_")) delete process.env[k]
}
afterEach(clearTargetEnv)

test("loads consecutive targets and stops at the first gap", () => {
  process.env.TARGET_1_URL = "http://a"
  process.env.TARGET_1_TYPE = "owntracks"
  process.env.TARGET_3_URL = "http://c" // no TARGET_2 -> this must be ignored
  const t = loadTargets()
  assert.equal(t.length, 1)
  assert.equal(t[0].url, "http://a")
  assert.equal(t[0].type, "owntracks")
})

test("invalid type falls back to raw", () => {
  process.env.TARGET_1_URL = "http://a"
  process.env.TARGET_1_TYPE = "bogus"
  assert.equal(loadTargets()[0].type, "raw")
})

test("skips a target with an invalid URL", () => {
  process.env.TARGET_1_URL = "not-a-url"
  assert.equal(loadTargets().length, 0)
})

test("parses batchMode=latest and ignores invalid values", () => {
  process.env.TARGET_1_URL = "http://a"
  process.env.TARGET_1_BATCH_MODE = "latest"
  assert.equal(loadTargets()[0].batchMode, "latest")

  clearTargetEnv()
  process.env.TARGET_1_URL = "http://a"
  process.env.TARGET_1_BATCH_MODE = "bogus"
  assert.equal(loadTargets()[0].batchMode, undefined)
})

test("parses split overrides as numbers", () => {
  process.env.TARGET_1_URL = "http://a"
  process.env.TARGET_1_SPLIT_CONCURRENCY = "3"
  process.env.TARGET_1_SPLIT_DELAY_MS = "250"
  const t = loadTargets()[0]
  assert.equal(t.splitConcurrency, 3)
  assert.equal(t.splitDelayMs, 250)
})
