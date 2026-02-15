/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, StyleSheet, Text, TouchableOpacity, Linking } from "react-native"
import { Settings, Fence, Search, Download, Info, Heart, LucideIcon } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { fonts } from "../../../styles/typography"
import { SectionTitle } from "../../ui/SectionTitle"

interface NavItem {
  name: string
  icon: LucideIcon
  color: string
  onPress?: () => void
}

interface QuickAccessProps {
  navigation: any
}

export function QuickAccess({ navigation }: QuickAccessProps) {
  const { colors } = useTheme()

  const navItems: NavItem[] = [
    {
      name: "Settings",
      icon: Settings,
      color: colors.primary,
      onPress: () => navigation.navigate("Settings")
    },
    {
      name: "Geofences",
      icon: Fence,
      color: colors.success,
      onPress: () => navigation.navigate("Geofences")
    },
    {
      name: "History",
      icon: Search,
      color: colors.info,
      onPress: () => navigation.navigate("Location History")
    },
    {
      name: "Export",
      icon: Download,
      color: colors.warning,
      onPress: () => navigation.navigate("Export Data")
    },
    {
      name: "About",
      icon: Info,
      color: colors.info,
      onPress: () => navigation.navigate("About Colota")
    },
    {
      name: "Support",
      icon: Heart,
      color: colors.error,
      onPress: () => Linking.openURL("https://mxd.codes/colota/support")
    }
  ]

  return (
    <View style={styles.container}>
      <SectionTitle>QUICK ACCESS</SectionTitle>
      <View style={styles.navGrid}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.name}
            activeOpacity={0.7}
            style={[
              styles.navItem,
              {
                backgroundColor: colors.card,
                borderColor: colors.border
              }
            ]}
            onPress={item.onPress}
          >
            <View
              style={[
                styles.navIconBox,
                {
                  backgroundColor: item.color + "15",
                  borderColor: item.color + "30"
                }
              ]}
            >
              <item.icon size={24} color={item.color} />
            </View>

            <Text style={[styles.navLabel, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12
  },
  navItem: {
    width: "31%",
    aspectRatio: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  navIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1
  },
  navLabel: {
    fontSize: 12,
    ...fonts.bold,
    textAlign: "center",
    letterSpacing: 0.3
  }
})
