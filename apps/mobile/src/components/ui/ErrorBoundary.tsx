/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React, { Component } from "react"
import { View, Text, StyleSheet, TouchableOpacity } from "react-native"
import { ThemeColors } from "../../types/global"
import { useTheme } from "../../hooks/useTheme"
import { logger } from "../../services/logger"
import { fonts, fontSizes } from "../../styles/typography"

interface ErrorBoundaryInternalProps {
  children: React.ReactNode
  colors: ThemeColors
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryInternal extends Component<ErrorBoundaryInternalProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryInternalProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("ErrorBoundary caught an error:", error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    const { colors, children } = this.props

    if (this.state.hasError) {
      return (
        <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
            {this.state.error?.message || "An unexpected error occurred"}
          </Text>
          <TouchableOpacity
            style={[styles.errorButton, { backgroundColor: colors.primary }]}
            onPress={this.handleReset}
          >
            <Text style={[styles.errorButtonText, { color: colors.textOnPrimary }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return children
  }
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  const { colors } = useTheme()
  return <ErrorBoundaryInternal colors={colors}>{children}</ErrorBoundaryInternal>
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  errorTitle: {
    fontSize: fontSizes.screenTitle,
    ...fonts.bold,
    marginBottom: 10
  },
  errorMessage: {
    fontSize: fontSizes.label,
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 20
  },
  errorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8
  },
  errorButtonText: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  }
})
