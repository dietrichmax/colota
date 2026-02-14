/* eslint-env node, jest */
/**
 * Jest setup file
 * Provides mocks for React Native native modules and browser APIs
 */

// SVG and Lucide icon mocks
jest.mock("react-native-svg", () => {
  const React = require("react")
  const c = (tag) => {
    const Component = (props) => React.createElement(tag, props)
    Component.displayName = tag
    return Component
  }
  return {
    __esModule: true,
    default: c("svg"),
    Svg: c("svg"),
    Path: c("path"),
    Circle: c("circle"),
    Rect: c("rect"),
    Line: c("line"),
    G: c("g")
  }
})

jest.mock("lucide-react-native", () => {
  const React = require("react")
  return new Proxy(
    {},
    {
      get: (_, name) => {
        const Icon = (props) => React.createElement("View", { ...props, testID: `icon-${String(name)}` })
        Icon.displayName = String(name)
        return Icon
      }
    }
  )
})

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
