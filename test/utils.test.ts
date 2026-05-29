import { test } from "node:test"
import assert from "node:assert/strict"
import { isFiniteNumber, hasFiniteNumbers, maskUrl } from "../src/utils"

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

test("maskUrl hides api_key and token", () => {
  assert.equal(maskUrl("https://url.com/p?api_key=secret&z=1"), "https://url.com/p?api_key=***&z=1")
  assert.equal(maskUrl("https://url.com/p?token=abc"), "https://url.com/p?token=***")
})

test("maskUrl returns the input unchanged when it isn't a URL", () => {
  assert.equal(maskUrl("not a url"), "not a url")
})
