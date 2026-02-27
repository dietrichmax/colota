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

  describe("log buffer", () => {
    beforeEach(() => {
      ;(globalThis as any).__DEV__ = true
    })

    function loadBuffer() {
      const mod = require("../logger")
      mod.setLogCollecting(true)
      mod.clearLogBuffer()
      return {
        logger: mod.logger,
        getLogEntries: mod.getLogEntries,
        clearLogBuffer: mod.clearLogBuffer,
        setLogCollecting: mod.setLogCollecting
      }
    }

    it("captures log entries", () => {
      const { logger, getLogEntries } = loadBuffer()
      logger.info("test message")

      const entries = getLogEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].level).toBe("INFO")
      expect(entries[0].message).toBe("test message")
      expect(entries[0].timestamp).toBeTruthy()
    })

    it("captures all log levels", () => {
      const { logger, getLogEntries } = loadBuffer()
      logger.debug("d")
      logger.info("i")
      logger.warn("w")
      logger.error("e")

      const entries = getLogEntries()
      expect(entries).toHaveLength(4)
      expect(entries.map((e: any) => e.level)).toEqual(["DEBUG", "INFO", "WARN", "ERROR"])
    })

    it("collects all entries without limit", () => {
      const { logger, getLogEntries } = loadBuffer()
      for (let i = 0; i < 600; i++) {
        logger.info(`msg ${i}`)
      }

      const entries = getLogEntries()
      expect(entries).toHaveLength(600)
      expect(entries[0].message).toBe("msg 0")
      expect(entries[entries.length - 1].message).toBe("msg 599")
    })

    it("clearLogBuffer empties the buffer", () => {
      const { logger, getLogEntries, clearLogBuffer } = loadBuffer()
      logger.info("test")
      expect(getLogEntries()).toHaveLength(1)

      clearLogBuffer()
      expect(getLogEntries()).toHaveLength(0)
    })

    it("formats Error objects", () => {
      const { logger, getLogEntries } = loadBuffer()
      logger.error("failed:", new Error("something broke"))

      expect(getLogEntries()[0].message).toBe("failed: something broke")
    })

    it("formats objects as JSON", () => {
      const { logger, getLogEntries } = loadBuffer()
      logger.info("data:", { key: "value" })

      expect(getLogEntries()[0].message).toBe('data: {"key":"value"}')
    })

    it("does not collect when collecting is disabled", () => {
      const { logger, getLogEntries, setLogCollecting } = loadBuffer()
      setLogCollecting(false)
      logger.info("should not be captured")

      expect(getLogEntries()).toHaveLength(0)
    })

    it("clears buffer when collecting is disabled", () => {
      const { logger, getLogEntries, setLogCollecting } = loadBuffer()
      logger.info("captured")
      expect(getLogEntries()).toHaveLength(1)

      setLogCollecting(false)
      expect(getLogEntries()).toHaveLength(0)
    })
  })
})
