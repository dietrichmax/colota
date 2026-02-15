const originalDev = (globalThis as any).__DEV__

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation()
  jest.spyOn(console, "warn").mockImplementation()
  jest.spyOn(console, "error").mockImplementation()
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.resetModules()
  ;(globalThis as any).__DEV__ = originalDev
})

function loadLogger() {
  return require("../logger").logger
}

describe("logger", () => {
  describe("in development (__DEV__ = true)", () => {
    beforeEach(() => {
      ;(globalThis as any).__DEV__ = true
    })

    it("debug logs via console.log", () => {
      const logger = loadLogger()
      logger.debug("test message", 123)

      expect(console.log).toHaveBeenCalledWith("test message", 123)
    })

    it("info logs via console.log", () => {
      const logger = loadLogger()
      logger.info("info message")

      expect(console.log).toHaveBeenCalledWith("info message")
    })

    it("warn logs via console.warn", () => {
      const logger = loadLogger()
      logger.warn("warning")

      expect(console.warn).toHaveBeenCalledWith("warning")
    })

    it("error logs via console.error", () => {
      const logger = loadLogger()
      logger.error("error", new Error("test"))

      expect(console.error).toHaveBeenCalledWith("error", expect.any(Error))
    })
  })

  describe("in production (__DEV__ = false)", () => {
    beforeEach(() => {
      ;(globalThis as any).__DEV__ = false
    })

    it("debug is suppressed", () => {
      const logger = loadLogger()
      logger.debug("should not appear")

      expect(console.log).not.toHaveBeenCalled()
    })

    it("info is suppressed", () => {
      const logger = loadLogger()
      logger.info("should not appear")

      expect(console.log).not.toHaveBeenCalled()
    })

    it("warn still logs", () => {
      const logger = loadLogger()
      logger.warn("visible warning")

      expect(console.warn).toHaveBeenCalledWith("visible warning")
    })

    it("error still logs", () => {
      const logger = loadLogger()
      logger.error("visible error")

      expect(console.error).toHaveBeenCalledWith("visible error")
    })
  })
})
