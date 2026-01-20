/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Text,
  StyleSheet,
  TextInput,
  Switch,
  View,
  ScrollView,
  TouchableOpacity,
  Animated,
} from "react-native";
import {
  ScreenProps,
  TRACKING_PRESETS,
  SyncPreset,
  SelectablePreset,
  Settings,
} from "../types/global";
import { useTheme } from "../hooks/useTheme";
import NativeLocationService from "../services/NativeLocationService";
import { useTracking } from "../contexts/TrackingProvider";
import { FloatingSaveIndicator } from "../components/ui/FloatingSaveIndicator";
import {
  Button,
  Section,
  SectionTitle,
  Card,
  Container,
  Divider,
  Footer,
} from "../components";
import { StatsCard, PresetOption, NumericInput } from "../components";

const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Settings screen for configuring location tracking.
 * Features auto-save, presets, and advanced customization.
 */
export function SettingsScreen({ navigation }: ScreenProps) {
  const { settings, setSettings, restartTracking } = useTracking();
  const { mode, toggleTheme, colors } = useTheme();

  // Stats
  const [queueCount, setQueueCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  // Inputs
  const [intervalInput, setIntervalInput] = useState(
    settings.interval.toString()
  );
  const [endpointInput, setEndpointInput] = useState(settings.endpoint || "");
  const [distanceInput, setDistanceInput] = useState(
    settings.distance?.toString() || "0"
  );
  const [accuracyTresholdInput, setAccuracyTresholdInput] = useState(
    settings.accuracyThreshold.toString()
  );

  // UI State
  const [testing, setTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testError, setTestError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedHeight = useRef(new Animated.Value(0)).current;

  // Sync inputs with settings changes
  useEffect(() => {
    setIntervalInput(settings.interval.toString());
    setDistanceInput(settings.distance?.toString() || "0");
    setEndpointInput(settings.endpoint || "");
  }, [
    settings.interval,
    settings.distance,
    settings.endpoint,
    settings.accuracyThreshold,
  ]);

  // Animate advanced panel
  useEffect(() => {
    Animated.spring(advancedHeight, {
      toValue: showAdvanced ? 1 : 0,
      useNativeDriver: false,
      tension: 50,
      friction: 10,
    }).start();
  }, [showAdvanced, advancedHeight]);

  /** Update stats */
  const updateStats = useCallback(async () => {
    try {
      const stats = await NativeLocationService.getStats();
      setQueueCount(stats.queued);
      setSentCount(stats.sent);
    } catch (err) {
      console.error("[SettingsScreen] Failed to get stats:", err);
    }
  }, []);

  /** Save settings and restart tracking */
  const saveSettings = useCallback(
    async (newSettings: Settings) => {
      setSaving(true);
      try {
        await setSettings(newSettings);
        await restartTracking(newSettings);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } catch (err) {
        console.error("[SettingsScreen] Save failed", err);
      } finally {
        setSaving(false);
      }
    },
    [setSettings, restartTracking]
  );

  const debouncedSave = useCallback(
    (newSettings: Settings) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(
        () => saveSettings(newSettings),
        AUTOSAVE_DEBOUNCE_MS
      );
    },
    [saveSettings]
  );

  const immediateSave = useCallback(
    (newSettings: Settings) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveSettings(newSettings);
    },
    [saveSettings]
  );

  // Poll stats every 5 seconds
  useEffect(() => {
    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, [updateStats]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  /** Generic numeric input handler */
  const handleNumericChange = useCallback(
    (
      key: "interval" | "distance" | "accuracyTreshold",
      value: string,
      min: number = 0
    ) => {
      if (key === "interval") setIntervalInput(value);
      if (key === "distance") setDistanceInput(value);
      if (key === "accuracyTreshold") setAccuracyTresholdInput(value);

      const num = Number(value);
      if (!isNaN(num) && num >= min) {
        const next = { ...settings, [key]: num, syncPreset: "custom" as const };
        setSettings(next);
        debouncedSave(next);
      }
    },
    [settings, setSettings, debouncedSave]
  );

  /** Ensure valid numbers on blur */
  const handleNumericBlur = useCallback(
    (key: "interval" | "distance" | "accuracyTreshold", min: number = 0) => {
      const currentStr =
        key === "interval"
          ? intervalInput
          : key === "distance"
          ? distanceInput
          : accuracyTresholdInput;
      let val = Number(currentStr);

      if (isNaN(val) || val < min) {
        val = min;
        if (key === "interval") setIntervalInput(min.toString());
        if (key === "distance") setDistanceInput(min.toString());
        if (key === "accuracyTreshold")
          setAccuracyTresholdInput(min.toString());

        const next = { ...settings, [key]: val };
        setSettings(next);
        immediateSave(next);
      }
    },
    [
      intervalInput,
      distanceInput,
      accuracyTresholdInput,
      settings,
      setSettings,
      immediateSave,
    ]
  );

  const handlePresetSelect = useCallback(
    async (preset: SyncPreset) => {
      if (preset === "custom") {
        const next = { ...settings, syncPreset: "custom" as const };
        setSettings(next);
        immediateSave(next);
        return;
      }

      const config = TRACKING_PRESETS[preset];
      const next: Settings = {
        ...settings,
        syncPreset: preset,
        interval: config.interval,
        distance: config.distance,
        syncInterval: config.syncInterval,
        retryInterval: config.retryInterval,
      };

      immediateSave(next);
    },
    [settings, setSettings, immediateSave]
  );

  const handleTestEndpoint = useCallback(async () => {
    if (!endpointInput) return;
    setTesting(true);
    setTestResponse(null);
    setTestError(false);

    try {
      const fieldMap = settings.fieldMap;
      const payload: Record<string, number | boolean> = {
        [fieldMap.lat]: 1,
        [fieldMap.lon]: 1,
        [fieldMap.acc]: 1,
      };

      if (fieldMap.alt) payload[fieldMap.alt] = 0;
      if (fieldMap.vel) payload[fieldMap.vel] = 0;
      if (fieldMap.batt) payload[fieldMap.batt] = 0;
      if (fieldMap.bs) payload[fieldMap.bs] = 0;
      if (fieldMap.tst) {
        payload[fieldMap.tst] = Math.floor(Date.now() / 1000);
        console.log(payload);
      }

      const response = await fetch(endpointInput, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setTestResponse("✓ Connection successful");
        const next = { ...settings, endpoint: endpointInput };
        immediateSave(next);
      } else {
        setTestResponse(`Failed: ${response.status}`);
        setTestError(true);
      }
    } catch (err: any) {
      setTestResponse(err.message || "Connection failed");
      setTestError(true);
    } finally {
      setTesting(false);
      setTimeout(() => setTestResponse(null), 3000);
    }
  }, [endpointInput, settings, immediateSave]);

  const handleOfflineModeChange = useCallback(
    (enabled: boolean) => {
      const next = { ...settings, isOfflineMode: enabled };
      immediateSave(next);
    },
    [settings, immediateSave]
  );

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header - More compact */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        </View>

        {/* Stats Card - Enhanced with better spacing */}
        <StatsCard
          queueCount={queueCount}
          sentCount={sentCount}
          interval={intervalInput}
          isOfflineMode={settings.isOfflineMode}
          onManageClick={() => navigation.navigate("Data Management")}
          colors={colors}
        />

        {/* Connection - Improved hierarchy */}
        <Section>
          <SectionTitle>Connection</SectionTitle>
          <Card>
            {/* Offline Mode - Better visual hierarchy */}
            <View style={styles.settingRow}>
              <View style={styles.settingContent}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  Offline Mode
                </Text>
                <Text
                  style={[styles.settingHint, { color: colors.textSecondary }]}
                >
                  Save locally, no network sync
                </Text>
              </View>
              <Switch
                value={settings.isOfflineMode}
                onValueChange={handleOfflineModeChange}
                trackColor={{
                  false: colors.border,
                  true: colors.primary + "80",
                }}
                thumbColor={settings.isOfflineMode ? colors.primary : "#f4f3f4"}
              />
            </View>

            {!settings.isOfflineMode && (
              <>
                <Divider />

                {/* Endpoint - Improved spacing and visual design */}
                <View style={styles.inputGroup}>
                  <View style={styles.inputHeader}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>
                      Server Endpoint
                    </Text>
                    {endpointInput && (
                      <View
                        style={[
                          styles.protocolBadge,
                          {
                            backgroundColor: endpointInput.startsWith(
                              "https://"
                            )
                              ? colors.success + "20"
                              : colors.warning + "20",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.protocolText,
                            {
                              color: endpointInput.startsWith("https://")
                                ? colors.success
                                : colors.warning,
                            },
                          ]}
                        >
                          {endpointInput.startsWith("https://")
                            ? "HTTPS"
                            : "⚠️ HTTP"}
                        </Text>
                      </View>
                    )}
                  </View>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        borderColor: colors.border,
                        color: colors.text,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={endpointInput}
                    onChangeText={setEndpointInput}
                    placeholder="https://your-server.com/api/locations"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>

                {/* Test button with improved styling */}
                <Button
                  style={[
                    styles.testButton,
                    { backgroundColor: colors.primary },
                    !endpointInput && styles.disabledButton,
                  ]}
                  onPress={handleTestEndpoint}
                  disabled={!endpointInput || testing}
                  title={testing ? "Testing..." : "Test Connection"}
                  color="#f8f7f7"
                />

                {/* Test response with animation would be nice */}
                {testResponse && (
                  <View
                    style={[
                      styles.responseBox,
                      {
                        borderColor: testError ? colors.error : colors.success,
                        backgroundColor:
                          (testError ? colors.error : colors.success) + "15",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.responseText,
                        { color: testError ? colors.error : colors.success },
                      ]}
                    >
                      {testResponse}
                    </Text>
                  </View>
                )}
              </>
            )}
          </Card>
        </Section>

        {/* Sync Strategy - Better visual grouping */}
        <Section>
          <SectionTitle>Sync Strategy</SectionTitle>
          <Card>
            {/* Presets with improved spacing */}
            <View style={styles.presetsContainer}>
              {(Object.keys(TRACKING_PRESETS) as SelectablePreset[]).map(
                (preset, index) => (
                  <View key={preset}>
                    <PresetOption
                      preset={preset}
                      isSelected={settings.syncPreset === preset}
                      onSelect={handlePresetSelect}
                      colors={colors}
                    />
                    {index < Object.keys(TRACKING_PRESETS).length - 1 && (
                      <View style={styles.presetSpacer} />
                    )}
                  </View>
                )
              )}
            </View>

            {/* Advanced Toggle - Better button design */}
            <TouchableOpacity
              style={[
                styles.advancedToggle,
                showAdvanced
                  ? styles.advancedToggleActive
                  : styles.advancedToggleInactive,
                {
                  borderColor: showAdvanced ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setShowAdvanced(!showAdvanced)}
              activeOpacity={0.7}
            >
              <Text style={[styles.advancedText, { color: colors.primary }]}>
                {showAdvanced ? "− Hide" : "+ Show"} Advanced Settings
              </Text>
            </TouchableOpacity>

            {/* Advanced Panel - Collapsible with better organization */}
            {showAdvanced && (
              <View style={styles.advancedPanel}>
                <Divider />

                {settings.syncPreset === "custom" && (
                  <View
                    style={[
                      styles.customBanner,
                      {
                        backgroundColor: colors.info + "15",
                        borderLeftColor: colors.info,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.customBannerText, { color: colors.info }]}
                    >
                      💡 Using custom configuration
                    </Text>
                  </View>
                )}

                {/* Tracking Parameters Group */}
                <View style={styles.paramGroup}>
                  <Text
                    style={[styles.paramGroupTitle, { color: colors.text }]}
                  >
                    Tracking Parameters
                  </Text>

                  <NumericInput
                    label="Tracking Interval"
                    value={intervalInput}
                    onChange={(val) => handleNumericChange("interval", val, 1)}
                    onBlur={() => handleNumericBlur("interval", 1)}
                    unit="seconds"
                    placeholder="1"
                    hint="How often to capture GPS position"
                    colors={colors}
                  />

                  <NumericInput
                    label="Movement Threshold"
                    value={distanceInput}
                    onChange={(val) => handleNumericChange("distance", val, 0)}
                    onBlur={() => handleNumericBlur("distance", 0)}
                    unit="meters"
                    placeholder="10"
                    hint="Only record if moved more than this distance"
                    colors={colors}
                  />
                </View>

                <Divider />

                {/* Network Parameters Group */}
                <View style={styles.paramGroup}>
                  <Text
                    style={[styles.paramGroupTitle, { color: colors.text }]}
                  >
                    Network Settings
                  </Text>

                  {/* Sync Interval */}
                  <View style={styles.settingBlock}>
                    <Text style={[styles.blockLabel, { color: colors.text }]}>
                      Sync Interval
                    </Text>
                    <Text
                      style={[
                        styles.blockHint,
                        { color: colors.textSecondary },
                      ]}
                    >
                      How often to upload data to server
                    </Text>

                    <View style={styles.optionsGrid}>
                      {([0, 60, 300, 900] as const).map((sec) => {
                        const labels: Record<number, string> = {
                          0: "Instant",
                          60: "1 min",
                          300: "5 min",
                          900: "15 min",
                        };
                        const isSelected = settings.syncInterval === sec;

                        return (
                          <TouchableOpacity
                            key={sec}
                            style={[
                              styles.gridOption,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.background,
                              },
                              isSelected && {
                                borderColor: colors.primary,
                                backgroundColor: colors.primary + "20",
                              },
                            ]}
                            onPress={() => {
                              const next = {
                                ...settings,
                                syncInterval: sec,
                                syncPreset: "custom" as const,
                              };
                              setSettings(next);
                              debouncedSave(next);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.gridLabel,
                                {
                                  color: isSelected
                                    ? colors.primary
                                    : colors.text,
                                },
                              ]}
                            >
                              {labels[sec]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Retry Interval */}
                  <View style={styles.settingBlock}>
                    <Text style={[styles.blockLabel, { color: colors.text }]}>
                      Retry Interval
                    </Text>
                    <Text
                      style={[
                        styles.blockHint,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Wait time before retrying failed uploads
                    </Text>

                    <View style={styles.optionsGrid}>
                      {([30, 300, 900] as const).map((sec) => {
                        const labels: Record<number, string> = {
                          30: "30s",
                          300: "5m",
                          900: "15m",
                        };
                        const isSelected = settings.retryInterval === sec;

                        return (
                          <TouchableOpacity
                            key={sec}
                            style={[
                              styles.gridOption,
                              {
                                borderColor: colors.border,
                                backgroundColor: colors.background,
                              },
                              isSelected && {
                                borderColor: colors.primary,
                                backgroundColor: colors.primary + "20",
                              },
                            ]}
                            onPress={() => {
                              const next = {
                                ...settings,
                                retryInterval: sec,
                                syncPreset: "custom" as const,
                              };
                              setSettings(next);
                              debouncedSave(next);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.gridLabel,
                                {
                                  color: isSelected
                                    ? colors.primary
                                    : colors.text,
                                },
                              ]}
                            >
                              {labels[sec]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Max Retries */}
                  <View style={styles.settingBlock}>
                    <Text style={[styles.blockLabel, { color: colors.text }]}>
                      Max Retry Attempts
                    </Text>
                    <View style={styles.retryGrid}>
                      {[3, 5, 10, 0].map((val) => (
                        <TouchableOpacity
                          key={val}
                          style={[
                            styles.retryChip,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.background,
                            },
                            settings.maxRetries === val && {
                              borderColor: colors.primary,
                              backgroundColor: colors.primary + "20",
                            },
                          ]}
                          onPress={() => {
                            const next = {
                              ...settings,
                              maxRetries: val,
                              syncPreset: "custom" as const,
                            };
                            setSettings(next);
                            debouncedSave(next);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.retryChipText,
                              {
                                color:
                                  settings.maxRetries === val
                                    ? colors.primary
                                    : colors.text,
                              },
                            ]}
                          >
                            {val === 0 ? "∞" : val}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text
                      style={[
                        styles.blockHint,
                        styles.retryHint,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {settings.maxRetries === 0
                        ? "⚠️ Unlimited retries may cause queue buildup"
                        : `Give up after ${settings.maxRetries} failed attempts`}
                    </Text>
                  </View>
                </View>

                <Divider />

                {/* Quality Parameters Group */}
                <View style={styles.paramGroup}>
                  <Text
                    style={[styles.paramGroupTitle, { color: colors.text }]}
                  >
                    Quality Filters
                  </Text>

                  {/* Accuracy Filter */}
                  <View style={styles.settingRow}>
                    <View style={styles.settingContent}>
                      <Text
                        style={[styles.settingLabel, { color: colors.text }]}
                      >
                        Filter Inaccurate Locations
                      </Text>
                      <Text
                        style={[
                          styles.settingHint,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Reject low-accuracy GPS readings
                      </Text>
                    </View>
                    <Switch
                      value={settings.filterInaccurateLocations}
                      onValueChange={(value) =>
                        immediateSave({
                          ...settings,
                          filterInaccurateLocations: value,
                        })
                      }
                      trackColor={{
                        false: colors.border,
                        true: colors.primary + "80",
                      }}
                      thumbColor={
                        settings.filterInaccurateLocations
                          ? colors.primary
                          : "#f4f3f4"
                      }
                    />
                  </View>

                  {settings.filterInaccurateLocations && (
                    <View style={styles.nestedSetting}>
                      <NumericInput
                        label="Accuracy Threshold"
                        value={accuracyTresholdInput}
                        onChange={(val) =>
                          handleNumericChange("accuracyTreshold", val, 50)
                        }
                        onBlur={() => handleNumericBlur("accuracyTreshold", 50)}
                        unit="meters"
                        placeholder="50"
                        hint="Reject readings with accuracy worse than this"
                        colors={colors}
                      />
                    </View>
                  )}
                </View>
              </View>
            )}
          </Card>
        </Section>

        {/* Appearance - Simplified */}
        <Section>
          <SectionTitle>Appearance</SectionTitle>
          <Card>
            <View style={styles.settingRow}>
              <View style={styles.settingContent}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  Dark Mode
                </Text>
              </View>
              <Switch
                value={mode === "dark"}
                onValueChange={toggleTheme}
                trackColor={{
                  false: colors.border,
                  true: colors.primary + "80",
                }}
                thumbColor={mode === "dark" ? colors.primary : "#f4f3f4"}
              />
            </View>
          </Card>
        </Section>

        {/* Advanced - Better visual separation */}
        <Section>
          <SectionTitle>Advanced</SectionTitle>
          <Card>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate("Data Management")}
              activeOpacity={0.6}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>
                  Data Management
                </Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                  View queu and clear data
                </Text>
              </View>
              <Text style={[styles.linkArrow, { color: colors.textLight }]}>
                ›
              </Text>
            </TouchableOpacity>

            <Divider />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate("API Config")}
              activeOpacity={0.6}
            >
              <View style={styles.linkContent}>
                <Text style={[styles.linkLabel, { color: colors.text }]}>
                  API Field Mapping
                </Text>
                <Text style={[styles.linkSub, { color: colors.textSecondary }]}>
                  Customize JSON payload structure
                </Text>
              </View>
              <Text style={[styles.linkArrow, { color: colors.textLight }]}>
                ›
              </Text>
            </TouchableOpacity>
          </Card>
        </Section>

        {/* Footer */}
        <Footer />
      </ScrollView>

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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },

  // Header
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },

  // Setting Rows
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  settingContent: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  settingHint: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Inputs
  inputGroup: {
    marginBottom: 12,
  },
  inputHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  protocolBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  protocolText: {
    fontSize: 11,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1.5,
    padding: 16,
    borderRadius: 12,
    fontSize: 15,
  },

  // Buttons
  testButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },

  // Response
  responseBox: {
    marginTop: 12,
    padding: 14,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: "center",
  },
  responseText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Presets
  presetsContainer: {
    marginBottom: 16,
  },
  presetSpacer: {
    height: 8,
  },

  // Advanced Toggle
  advancedToggle: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    marginTop: 8,
  },
  advancedToggleActive: {
    backgroundColor: "transparent", // Will be overridden by dynamic color
  },
  advancedToggleInactive: {
    backgroundColor: "transparent",
  },
  advancedText: {
    fontSize: 15,
    fontWeight: "600",
  },

  // Advanced Panel
  advancedPanel: {
    marginTop: 16,
  },
  customBanner: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
  },
  customBannerText: {
    fontSize: 13,
    fontWeight: "500",
  },

  // Parameter Groups
  paramGroup: {
    marginBottom: 4,
  },
  paramGroupTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    opacity: 0.6,
  },

  // Setting Blocks
  settingBlock: {
    marginBottom: 20,
  },
  blockLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  blockHint: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },

  // Grid Options
  optionsGrid: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  gridOption: {
    flex: 1,
    minWidth: "22%",
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  gridLabel: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Retry Grid
  retryGrid: {
    flexDirection: "row",
    gap: 10,
  },
  retryChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  retryChipText: {
    fontSize: 16,
    fontWeight: "700",
  },
  retryHint: {
    marginTop: 8,
  },

  // Nested Settings
  nestedSetting: {
    marginTop: 12,
    paddingLeft: 16,
    borderLeftWidth: 3,
    borderLeftColor: "rgba(0,0,0,0.1)",
  },

  // Links
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  linkContent: {
    flex: 1,
  },
  linkLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  linkSub: {
    fontSize: 13,
  },
  linkArrow: {
    fontSize: 28,
    fontWeight: "300",
    marginLeft: 12,
  },
});
