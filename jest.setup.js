/* eslint-env node */
/**
 * Jest setup file
 * Provides mocks for React Native native modules and browser APIs
 */

// Blob polyfill for getByteSize tests (RN test env doesn't have Blob)
if (typeof global.Blob === "undefined") {
  global.Blob = class Blob {
    constructor(parts) {
      this._content = parts.map((p) => String(p)).join("")
    }
    get size() {
      return Buffer.byteLength(this._content, "utf8")
    }
  }
}
