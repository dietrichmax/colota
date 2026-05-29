import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import type { Server } from "node:http"

process.env.API_KEY = "secret"
const { app } = await import("../src/app")

let server: Server
let base: string
before(() => {
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body })

const validPoint = JSON.stringify({ lat: 1, lon: 2, tst: 100, acc: 5, batt: 90, bs: 2 })
const withKey = { "x-api-key": "secret" }

test("POST without an API key is rejected (403)", async () => {
  assert.equal((await post("/locations", validPoint)).status, 403)
})

test("POST with the wrong API key is rejected (403)", async () => {
  assert.equal((await post("/locations", validPoint, { "x-api-key": "nope" })).status, 403)
})

test("POST /locations with a valid point and key is accepted (200)", async () => {
  assert.equal((await post("/locations", validPoint, withKey)).status, 200)
})

test("POST /locations with missing fields is rejected (400)", async () => {
  assert.equal((await post("/locations", JSON.stringify({ lat: 1 }), withKey)).status, 400)
})

test("malformed JSON returns 400, not 500", async () => {
  assert.equal((await post("/overland", "{bad", withKey)).status, 400)
})

test("POST /overland with a valid batch is accepted (201)", async () => {
  assert.equal((await post("/overland", JSON.stringify({ device_id: "d", locations: [] }), withKey)).status, 201)
})

test("GET /health needs no auth (200)", async () => {
  assert.equal((await fetch(base + "/health")).status, 200)
})
