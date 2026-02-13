/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { useTheme } from "../../hooks/useTheme"
import ErrorBoundary from "./ErrorBoundary"

interface ThemedErrorBoundaryProps {
  children: React.ReactNode
}

const ThemedErrorBoundary: React.FC<ThemedErrorBoundaryProps> = ({ children }) => {
  const { colors } = useTheme()

  return <ErrorBoundary colors={colors}>{children}</ErrorBoundary>
}

export default ThemedErrorBoundary
