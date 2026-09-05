import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { Text } from "react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      background: "#fff",
      text: "#000",
      textSecondary: "#666",
      primary: "#0d9488",
      textOnPrimary: "#fff"
    }
  })
}))

jest.mock("../../../utils/logger", () => ({
  logger: {
    error: jest.fn()
  }
}))

import { ErrorBoundary } from "../ErrorBoundary"
import { logger } from "../../../utils/logger"

beforeEach(() => {
  jest.clearAllMocks()
})

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error message")
  }
  return <Text>Child content</Text>
}

describe("ErrorBoundary", () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation()
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it("renders children when no error occurs", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    )

    expect(getByText("Child content")).toBeTruthy()
  })

  it("renders fallback UI when child throws", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(getByText("Something went wrong")).toBeTruthy()
    expect(getByText("Test error message")).toBeTruthy()
    expect(getByText("Try Again")).toBeTruthy()
  })

  it("logs error via logger.error", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(logger.error).toHaveBeenCalledWith(
      "ErrorBoundary caught an error:",
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    )
  })

  it("recovers when Try Again is pressed", () => {
    let shouldThrow = true

    function ToggleChild() {
      if (shouldThrow) {
        throw new Error("recoverable error")
      }
      return <Text>Recovered</Text>
    }

    const { getByText } = render(
      <ErrorBoundary>
        <ToggleChild />
      </ErrorBoundary>
    )

    expect(getByText("Something went wrong")).toBeTruthy()

    shouldThrow = false

    fireEvent.press(getByText("Try Again"))

    expect(getByText("Recovered")).toBeTruthy()
  })

  it("shows generic message when error has no message", () => {
    function EmptyErrorChild(): React.ReactNode {
      throw new Error("")
    }

    const { getByText } = render(
      <ErrorBoundary>
        <EmptyErrorChild />
      </ErrorBoundary>
    )

    expect(getByText("Something went wrong")).toBeTruthy()
  })
})
