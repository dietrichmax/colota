/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React, { Component } from "react"
import { View, Text, StyleSheet } from "react-native"
import { ThemeColors } from "../../types/global"
import { useTheme } from "../../hooks/useTheme"
import { logger } from "../../utils/logger"
import { fontSizes, type } from "../../styles/typography"
import { space } from "../../constants"

import { Button } from "./Button"
import { t } from "../../i18n/t"

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
          <Text style={[styles.errorTitle, { color: colors.text }]}>{t("error.title")}</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
            {this.state.error?.message || t("error.unexpected")}
          </Text>
          <Button title={t("error.retry")} onPress={this.handleReset} />
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
    padding: space.lg
  },
  errorTitle: {
    ...type.display,
    marginBottom: space.md
  },
  errorMessage: {
    fontSize: fontSizes.label,
    textAlign: "center",
    marginBottom: space.lg,
    paddingHorizontal: space.lg
  }
})
