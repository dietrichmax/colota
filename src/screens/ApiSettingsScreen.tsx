/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { Text, StyleSheet, TextInput, View, ScrollView, TouchableOpacity } from "react-native";
import { FieldMap, DEFAULT_FIELD_MAP, ScreenProps } from "../types/global";
import { useTheme } from "../hooks/useTheme";
import { useTracking } from "../contexts/TrackingProvider";
import { Button } from "../components";
import {
  SectionTitle,
  FloatingSaveIndicator,
  Container,
  Divider,
} from "../components";

/** Field descriptions for UI display */
const FIELD_DESCRIPTIONS: Record<keyof FieldMap, string> = {
  lat: "Latitude coordinate",
  lon: "Longitude coordinate",
  acc: "GPS accuracy in meters",
  alt: "Altitude in meters",
  vel: "Speed in m/s",
  batt: "Battery level percentage",
  bs: "Battery charging status",
  tst: "Timestamp",
  bear: "Direction of travel (0-360°)",
};

/**
 * Screen for configuring API field name mappings.
 *
 * UX IMPROVEMENTS:
 * - Two-column layout (key → value) for better scannability
 * - Visual indicators for modified fields
 * - Quick copy default name feature
 * - Cleaner, more compact design
 * - Better touch targets
 */
export function ApiSettingsScreen({ navigation }: ScreenProps) {
  const { settings, setSettings, restartTracking } = useTracking();
  const { colors } = useTheme();

  const [localFieldMap, setLocalFieldMap] = useState<FieldMap>(
    settings.fieldMap || DEFAULT_FIELD_MAP
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  /**
   * Check if field has been modified from default
   */
  const isModified = (key: keyof FieldMap): boolean => {
    return localFieldMap[key] !== DEFAULT_FIELD_MAP[key];
  };

  /**
   * Saves field map and restarts tracking if active
   */
  const saveSettings = useCallback(
    async (newFieldMap: FieldMap) => {
      // Sanitize: trim all field values
      const sanitizedMap = Object.fromEntries(
        Object.entries(newFieldMap).map(([key, value]) => [key, value.trim()])
      ) as FieldMap;

      // Prevent saving if any field is empty
      if (Object.values(sanitizedMap).some((v) => v === "")) {
        return;
      }

      try {
        setSaving(true);
        setSaveSuccess(false);

        const newSettings = { ...settings, fieldMap: sanitizedMap };

        await setSettings(newSettings);
        await restartTracking(newSettings);

        setSaving(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (err) {
        setSaving(false);
        console.error("[ApiSettingsScreen] Failed to save field map:", err);
      }
    },
    [settings, setSettings, restartTracking]
  );

  /**
   * Debounced save (1.5s delay)
   */
  const debouncedSave = useCallback(
    (newFieldMap: FieldMap) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(
        () => saveSettings(newFieldMap),
        1500
      );
    },
    [saveSettings]
  );

  /**
   * Handles field value changes with auto-save
   */
  const handleFieldChange = useCallback(
    (key: keyof FieldMap, value: string) => {
      const newFieldMap = { ...localFieldMap, [key]: value };
      setLocalFieldMap(newFieldMap);
      debouncedSave(newFieldMap);
    },
    [localFieldMap, debouncedSave]
  );

  /**
   * Reset single field to default
   */
  const handleResetField = useCallback(
    (key: keyof FieldMap) => {
      const newFieldMap = { ...localFieldMap, [key]: DEFAULT_FIELD_MAP[key] };
      setLocalFieldMap(newFieldMap);
      
      // Cancel debounce and save immediately
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveSettings(newFieldMap);
    },
    [localFieldMap, saveSettings]
  );

  /**
   * Resets all fields to default values
   */
  const handleResetAll = useCallback(() => {
    // Cancel any pending auto-saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setLocalFieldMap(DEFAULT_FIELD_MAP);
    saveSettings(DEFAULT_FIELD_MAP);
  }, [saveSettings]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Check if any field is modified
  const hasModifications = (Object.keys(DEFAULT_FIELD_MAP) as Array<keyof FieldMap>).some(
    (key) => isModified(key)
  );

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            API Field Mapping
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Customize field names sent to your server
          </Text>
        </View>


        {/* Field Mapping Section */}
        <View style={styles.fieldsSection}>
          <View style={styles.sectionHeader}>
            <SectionTitle>FIELD MAPPINGS</SectionTitle>
            {hasModifications && (
              <TouchableOpacity
                onPress={handleResetAll}
                style={styles.resetAllButton}
              >
                <Text style={[styles.resetAllText, { color: colors.primary }]}>
                  RESET ALL
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View
            style={[
              styles.fieldsCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {(Object.keys(DEFAULT_FIELD_MAP) as Array<keyof FieldMap>).map(
              (key, index) => (
                <View key={key}>
                  {/* Two-column layout */}
                  <View style={styles.fieldRow}>
                    {/* Left: Key info */}
                    <View style={styles.keyColumn}>
                      <View style={styles.keyHeader}>
                        <Text style={[styles.fieldLabel, { color: colors.text }]}>
                          {key.toUpperCase()}
                        </Text>
                        {isModified(key) && (
                          <View style={[styles.modifiedBadge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.modifiedText}>Modified</Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.fieldDescription,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {FIELD_DESCRIPTIONS[key]}
                      </Text>
                    </View>

                    {/* Right: Value input */}
                    <View style={styles.valueColumn}>
                      <View style={styles.inputRow}>
                        <TextInput
                          style={[
                            styles.fieldInput,
                            {
                              borderColor: isModified(key) ? colors.primary : colors.border,
                              color: colors.text,
                              backgroundColor: colors.background,
                            },
                          ]}
                          value={localFieldMap[key]}
                          onChangeText={(text) => handleFieldChange(key, text)}
                          placeholder={DEFAULT_FIELD_MAP[key]}
                          placeholderTextColor={colors.placeholder}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {isModified(key) && (
                          <TouchableOpacity
                            onPress={() => handleResetField(key)}
                            style={[styles.resetButton, { backgroundColor: colors.border }]}
                          >
                            <Text style={[styles.resetIcon, { color: colors.textSecondary }]}>
                              ↺
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>

                  {index < Object.keys(DEFAULT_FIELD_MAP).length - 1 && (
                    <Divider />
                  )}
                </View>
              )
            )}
          </View>
        </View>

        {/* Example payload preview */}
        <View style={styles.exampleSection}>
          <SectionTitle>EXAMPLE PAYLOAD</SectionTitle>
          <View
            style={[
              styles.exampleCard,
              { backgroundColor: colors.backgroundElevated, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.exampleCode, { color: colors.textSecondary }]}>
              {`{\n`}
              {`  "${localFieldMap.lat}": 52.12345,\n`}
              {`  "${localFieldMap.lon}": -2.12345,\n`}
              {`  "${localFieldMap.acc}": 15,\n`}
              {`  "${localFieldMap.batt}": 85,\n`}
              {`  ...\n`}
              {`}`}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textLight }]}>
            Changes apply to new location data immediately
          </Text>
        </View>
      </ScrollView>

      {/* Floating Save Indicator */}
      <FloatingSaveIndicator
        saving={saving}
        success={saveSuccess}
        colors={colors}
      />
    </Container>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    marginTop: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  fieldsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resetAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  resetAllText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  fieldsCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  fieldRow: {
    flexDirection: "row",
    paddingVertical: 10,
    gap: 12,
  },
  keyColumn: {
    flex: 1,
    justifyContent: "center",
  },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  modifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modifiedText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  fieldDescription: {
    fontSize: 11,
    lineHeight: 15,
  },
  valueColumn: {
    flex: 1,
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fieldInput: {
    flex: 1,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "monospace",
  },
  resetButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  resetIcon: {
    fontSize: 18,
    fontWeight: "600",
  },
  exampleSection: {
    marginBottom: 20,
  },
  exampleCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  exampleCode: {
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 18,
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  footerText: {
    fontSize: 11,
    textAlign: "center",
  },
});