import { test } from "node:test"
import assert from "node:assert/strict"
import { isFiniteNumber, hasFiniteNumbers, maskUrl, sanitizeLogValue, targetHost, isValidTid } from "../src/utils"

test("isFiniteNumber rejects NaN, Infinity and non-numbers", () => {
  assert.equal(isFiniteNumber(5), true)
  assert.equal(isFiniteNumber(0), true)
  assert.equal(isFiniteNumber(NaN), false)
  assert.equal(isFiniteNumber(Infinity), false)
  assert.equal(isFiniteNumber("5"), false)
  assert.equal(isFiniteNumber(undefined), false)
})

test("hasFiniteNumbers requires every key to be a finite number", () => {
  assert.equal(hasFiniteNumbers({ a: 1, b: 2 }, ["a", "b"]), true)
  assert.equal(hasFiniteNumbers({ a: 1 }, ["a", "b"]), false) // missing
  assert.equal(hasFiniteNumbers({ a: 1, b: "2" }, ["a", "b"]), false) // wrong type
})

test("maskUrl drops every query value, not just known secret names", () => {
  // logs get pasted into issue reports — a param name we don't recognise must not leak
  assert.equal(maskUrl("https://url.com/p?api_key=secret&z=1"), "https://url.com/p?…")
  assert.equal(maskUrl("https://url.com/p?token=abc"), "https://url.com/p?…")
  assert.equal(maskUrl("https://url.com/p?key=secret"), "https://url.com/p?…")
  assert.equal(maskUrl("https://url.com/p?access_token=secret"), "https://url.com/p?…")
})

test("maskUrl never prints URL credentials, but shows that some are set", () => {
  assert.equal(
    maskUrl("https://admin:hunter2@geopulse.example.com/api/colota"),
    "https://***@geopulse.example.com/api/colota"
  )
  assert.equal(maskUrl("https://admin@url.com/p"), "https://***@url.com/p")
})

test("maskUrl keeps host and path so a failing target stays identifiable", () => {
  // two targets on one host differ only by path — both must survive masking
  assert.equal(
    maskUrl("http://dawarich:3000/api/v1/owntracks/points?api_key=x"),
    "http://dawarich:3000/api/v1/owntracks/points?…"
  )
  assert.equal(
    maskUrl("http://dawarich:3000/api/v1/overland/batches?api_key=x"),
    "http://dawarich:3000/api/v1/overland/batches?…"
  )
})

test("isValidTid keeps free-form ids but rejects what breaks an outbound header", () => {
  // README documents tid as free-form, so these must keep working
  assert.equal(isValidTid("phone1"), true)
  assert.equal(isValidTid("Max Phone"), true)
  assert.equal(isValidTid("phone.1"), true)
  // a CR or LF makes fetch() reject X-Limit-D, dropping the point while the client sees success
  assert.equal(isValidTid("AA\r\nX-Injected: yes"), false)
  assert.equal(isValidTid("a\u0000b"), false)
  // type confusion and unbounded length reach downstream records
  assert.equal(isValidTid({ evil: 1 }), false)
  assert.equal(isValidTid(""), false)
  assert.equal(isValidTid("x".repeat(65)), false)
  assert.equal(isValidTid("x".repeat(64)), true)
})

test("targetHost keeps host and port and nothing else", () => {
  assert.equal(targetHost("http://dawarich:3000/api/v1/owntracks/points?api_key=x"), "dawarich:3000")
  assert.equal(targetHost("https://geopulse.example.com/api/colota"), "geopulse.example.com")
  assert.equal(targetHost("not a url"), "not a url")
})

test("maskUrl returns the input unchanged when it isn't a URL", () => {
  assert.equal(maskUrl("not a url"), "not a url")
})

test("sanitizeLogValue removes CR/LF so user input can't forge log lines", () => {
  assert.equal(sanitizeLogValue("GET /path"), "GET /path")
  // a forged second line is flattened back onto one line
  assert.equal(sanitizeLogValue("GET /a\r\n[INFO] User: Admin"), "GET /a[INFO] User: Admin")
})
