/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { SectionTitle } from "../../ui/SectionTitle";
import { ComingSoonRibbon } from "./ComingSoonRibbon";

interface NavItem {
  name: string;
  icon: string;
  color: string;
  onPress?: () => void;
  comingSoon?: boolean;
  subtitle?: string; // NEW: Add subtitle for context
}

interface QuickAccessProps {
  navigation: any;
}

export function QuickAccess({ navigation }: QuickAccessProps) {
  const { colors } = useTheme();

  const navItems: NavItem[] = [
    {
      name: "Settings",
      icon: "⚙️",
      color: colors.primary,
      subtitle: "Configure tracking",
      onPress: () => navigation.navigate("Settings"),
    },
    {
      name: "Geofences",
      icon: "🏡",
      color: colors.success,
      subtitle: "Manage zones",
      onPress: () => navigation.navigate("Geofences"),
    },
    {
      name: "Inspector",
      icon: "🔍",
      color: colors.info,
      subtitle: "View locations",
      onPress: () => navigation.navigate("Locations Inspector"),
    },
    {
      name: "Export",
      icon: "📤",
      color: colors.warning,
      subtitle: "Download data",
      onPress: () => navigation.navigate("Export Data"),
    },
    {
      name: "About",
      icon: "ℹ️",
      color: colors.info,
      subtitle: "App info",
      onPress: () => navigation.navigate("About Colota"),
    },
    {
      name: "Support",
      icon: "💖",
      color: colors.error,
      subtitle: "Help us grow",
      onPress: () => Linking.openURL("https://mxd.codes/colota/support"),
    },
  ];

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
                borderColor: colors.border,
              },
            ]}
            onPress={item.onPress}
          >
            {/* Icon with gradient background */}
            <View
              style={[
                styles.navIconBox,
                {
                  backgroundColor: item.color + "15",
                  borderColor: item.color + "30",
                },
              ]}
            >
              <Text style={styles.navIcon}>{item.icon}</Text>
            </View>

            {/* Title */}
            <Text
              style={[styles.navLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            {/* Subtitle */}
            {item.subtitle && (
              <Text
                style={[styles.navSubtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {item.subtitle}
              </Text>
            )}

            {item.comingSoon && <ComingSoonRibbon />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12, // Increased gap
  },
  navItem: {
    width: "31%",
    aspectRatio: 1, // Square cards
    padding: 12,
    borderRadius: 16, // More rounded
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    // Add subtle shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  navIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
  },
  navIcon: {
    fontSize: 24, // Slightly larger
  },
  navLabel: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  navSubtitle: {
    fontSize: 10,
    textAlign: "center",
    opacity: 0.7,
  },
});
