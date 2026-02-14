/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect } from "react"
import { Text, StyleSheet, View, ScrollView, Linking, TouchableOpacity, Image } from "react-native"
import { ScreenProps, ThemeColors } from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { ChevronRight, Bug, FileText, Code, ScrollText } from "lucide-react-native"
import { fonts } from "../styles/typography"
import { Card, Container, Divider, Footer } from "../components"
import NativeLocationService from "../services/NativeLocationService"
import icon from "../assets/icons/icon.png"
import { REPO_URL, PRIVACY_POLICY_URL } from "../constants"

// Helper function to map SDK to Android version
function getAndroidVersion(sdkVersion: number): string {
  const versions: Record<number, string> = {
    24: "7.0",
    25: "7.1",
    26: "8.0",
    27: "8.1",
    28: "9",
    29: "10",
    30: "11",
    31: "12",
    32: "12L",
    33: "13",
    34: "14",
    35: "15",
    36: "16",
    37: "17"
  }
  return versions[sdkVersion] || "Unknown"
}

const LinkRow = ({
  icon: Icon,
  title,
  subtitle,
  url,
  colors,
  onOpenURL
}: {
  icon: React.ComponentType<{ size: number; color: string }>
  title: string
  subtitle: string
  url: string
  colors: ThemeColors
  onOpenURL: (url: string) => void
}) => (
  <TouchableOpacity style={styles.linkRow} onPress={() => onOpenURL(url)} activeOpacity={0.7}>
    <Icon size={20} color={colors.primaryDark} />
    <View style={styles.linkTextContainer}>
      <Text style={[styles.linkTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.linkSubtitle, { color: colors.textLight }]}>{subtitle}</Text>
    </View>
    <ChevronRight size={18} color={colors.textLight} />
  </TouchableOpacity>
)

const TechRow = ({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) => (
  <>
    <View style={styles.techRow}>
      <Text style={[styles.techLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.techValue, { color: colors.text }]}>{value}</Text>
    </View>
    <Divider />
  </>
)

export function AboutScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const [tapCount, setTapCount] = useState(0)
  const [deviceInfo, setDeviceInfo] = useState({
    model: "...",
    brand: "...",
    deviceId: "...",
    systemVersion: "...",
    apiLevel: "..."
  })

  const buildConfig = NativeLocationService.getBuildConfig()

  // Reset tap count after 2 seconds
  useEffect(() => {
    if (tapCount > 0) {
      const timer = setTimeout(() => setTapCount(0), 2000)
      return () => clearTimeout(timer)
    }
  }, [tapCount])

  const handleVersionTap = () => {
    const newCount = tapCount + 1
    setTapCount(newCount)

    // Enable debug mode after 7 taps
    if (newCount >= 7) {
      setShowDebugInfo(true)
      setTapCount(0)
    }
  }

  useEffect(() => {
    const loadDeviceInfo = async () => {
      try {
        const info = await NativeLocationService.getDeviceInfo()
        setDeviceInfo({
          model: info.model,
          brand: info.brand,
          deviceId: info.deviceId,
          systemVersion: info.systemVersion,
          apiLevel: info.apiLevel.toString()
        })
      } catch (err) {
        console.error("Failed to load device info:", err)
      }
    }

    loadDeviceInfo()
  }, [])

  const handleOpenURL = (url: string) => {
    Linking.openURL(url).catch((err) => console.error("Failed to open URL:", err))
  }

  // Fallback if buildConfig is not available
  if (!buildConfig) {
    return (
      <Container>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
          </View>
        </ScrollView>
      </Container>
    )
  }

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.appIconContainer} onPress={handleVersionTap} activeOpacity={0.8}>
            <Image source={icon} style={styles.appIcon} resizeMode="contain" />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Colota</Text>
          <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.8}>
            <Text style={[styles.version, { color: colors.textSecondary }]}>Version {buildConfig.VERSION_NAME}</Text>
          </TouchableOpacity>

          {/* Tap counter hint */}
          {tapCount > 0 && tapCount < 7 && (
            <Text style={[styles.debugHint, { color: colors.textLight }]}>
              {7 - tapCount} more taps to enable debug mode
            </Text>
          )}

          {showDebugInfo && (
            <TouchableOpacity
              onPress={() => setShowDebugInfo(false)}
              style={[styles.debugBadge, { backgroundColor: colors.warning + "20" }]}
            >
              <Bug size={14} color={colors.warning} />
              <Text style={[styles.debugText, { color: colors.warning }]}>Debug Mode (tap to hide)</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Links */}
        <Card>
          <LinkRow
            icon={FileText}
            title="Privacy Policy"
            subtitle={PRIVACY_POLICY_URL}
            url={PRIVACY_POLICY_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
          <Divider />
          <LinkRow
            icon={Code}
            title="Source Code"
            subtitle="github.com/dietrichmax/colota"
            url={REPO_URL}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
          <Divider />
          <LinkRow
            icon={ScrollText}
            title="License"
            subtitle="GNU AGPLv3"
            url={`${REPO_URL}/blob/main/LICENSE`}
            colors={colors}
            onOpenURL={handleOpenURL}
          />
        </Card>

        {/* Debug Info - Only shown when enabled */}
        {showDebugInfo && (
          <>
            <View style={styles.debugSection}>
              <Text style={[styles.debugSectionTitle, { color: colors.textLight }]}>Build</Text>
              <Card>
                <TechRow
                  label="Target SDK"
                  value={`${buildConfig.TARGET_SDK_VERSION} (Android ${getAndroidVersion(
                    buildConfig.TARGET_SDK_VERSION
                  )})`}
                  colors={colors}
                />
                <TechRow
                  label="Min SDK"
                  value={`${buildConfig.MIN_SDK_VERSION} (Android ${getAndroidVersion(buildConfig.MIN_SDK_VERSION)})`}
                  colors={colors}
                />
                <TechRow label="Compile SDK" value={buildConfig.COMPILE_SDK_VERSION.toString()} colors={colors} />
                <TechRow label="Build Tools" value={buildConfig.BUILD_TOOLS_VERSION} colors={colors} />
                <TechRow label="Kotlin" value={buildConfig.KOTLIN_VERSION} colors={colors} />
                <View style={styles.techRow}>
                  <Text style={[styles.techLabel, { color: colors.textSecondary }]}>NDK</Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>{buildConfig.NDK_VERSION}</Text>
                </View>
              </Card>
            </View>

            <View style={styles.debugSection}>
              <Text style={[styles.debugSectionTitle, { color: colors.textLight }]}>Device</Text>
              <Card>
                <TechRow label="OS" value={`Android ${deviceInfo.systemVersion}`} colors={colors} />
                <TechRow label="API Level" value={deviceInfo.apiLevel} colors={colors} />
                <TechRow label="Model" value={deviceInfo.model} colors={colors} />
                <TechRow label="Brand" value={deviceInfo.brand} colors={colors} />
                <View style={styles.techRow}>
                  <Text style={[styles.techLabel, { color: colors.textSecondary }]}>Device ID</Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>{deviceInfo.deviceId}</Text>
                </View>
              </Card>
            </View>
          </>
        )}

        <Footer />
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8
  },
  header: {
    marginTop: 20,
    marginBottom: 24,
    alignItems: "center"
  },
  appIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden"
  },
  appIcon: {
    width: 80,
    height: 80
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    marginBottom: 4
  },
  version: {
    fontSize: 13,
    ...fonts.regular
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12
  },
  linkTextContainer: {
    flex: 1
  },
  linkTitle: {
    fontSize: 15,
    ...fonts.semiBold
  },
  linkSubtitle: {
    fontSize: 12,
    marginTop: 1
  },
  techRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8
  },
  techLabel: {
    fontSize: 14,
    ...fonts.medium
  },
  techValue: {
    fontSize: 14,
    ...fonts.semiBold
  },
  debugSection: {
    marginTop: 24
  },
  debugSectionTitle: {
    fontSize: 12,
    ...fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8
  },
  debugHint: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: "italic"
  },
  debugBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6
  },
  debugText: {
    fontSize: 12,
    ...fonts.semiBold
  }
})
