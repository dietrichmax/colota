/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback } from "react"
import { Text, StyleSheet, TextInput, View, ScrollView, TouchableOpacity } from "react-native"
import {
  FieldMap,
  DEFAULT_FIELD_MAP,
  ScreenProps,
  CustomField,
  ApiTemplateName,
  API_TEMPLATES,
  HttpMethod
} from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { useTracking } from "../contexts/TrackingProvider"
import { fonts } from "../styles/typography"
import { SectionTitle, FloatingSaveIndicator, Container, Divider } from "../components"

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
  bear: "Direction of travel (0-360°)"
}

const TEMPLATE_OPTIONS: { value: ApiTemplateName; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "dawarich", label: "Dawarich" },
  { value: "owntracks", label: "OwnTracks" },
  { value: "phonetrack", label: "PhoneTrack" },
  { value: "reitti", label: "Reitti" },
  { value: "traccar", label: "Traccar" }
]

const HTTP_METHOD_OPTIONS: { value: HttpMethod; label: string }[] = [
  { value: "POST", label: "POST" },
  { value: "GET", label: "GET" }
]

/**
 * Returns the reference field map for the current template.
 * Used for "Modified" badge comparison and "Reset" actions.
 */
function getReferenceFieldMap(template: ApiTemplateName): FieldMap {
  if (template === "custom") return DEFAULT_FIELD_MAP
  return API_TEMPLATES[template].fieldMap
}

function getReferenceCustomFields(template: ApiTemplateName): CustomField[] {
  if (template === "custom") return []
  return API_TEMPLATES[template].customFields
}

/**
 * Screen for configuring API field name mappings, backend templates,
 * and custom static fields.
 */
export function ApiSettingsScreen({}: ScreenProps) {
  const { settings, setSettings, restartTracking } = useTracking()
  const { colors } = useTheme()

  const [localFieldMap, setLocalFieldMap] = useState<FieldMap>(settings.fieldMap || DEFAULT_FIELD_MAP)
  const [localCustomFields, setLocalCustomFields] = useState<CustomField[]>(settings.customFields || [])
  const [localTemplate, setLocalTemplate] = useState<ApiTemplateName>(settings.apiTemplate || "custom")
  const [localHttpMethod, setLocalHttpMethod] = useState<HttpMethod>(settings.httpMethod || "POST")
  const { saving, saveSuccess, debouncedSaveAndRestart, immediateSaveAndRestart } = useAutoSave()

  const referenceFieldMap = getReferenceFieldMap(localTemplate)

  /**
   * Check if field has been modified from the current template's defaults
   */
  const isModified = (key: keyof FieldMap): boolean => {
    return localFieldMap[key] !== referenceFieldMap[key]
  }

  /**
   * Build sanitized settings from current field map, custom fields, and template.
   * Returns null if validation fails (empty field mappings).
   */
  const buildSanitizedSettings = useCallback(
    (
      newFieldMap: FieldMap,
      newCustomFields: CustomField[],
      newTemplate: ApiTemplateName,
      newHttpMethod: HttpMethod
    ) => {
      const sanitizedMap = Object.fromEntries(
        Object.entries(newFieldMap).map(([key, value]) => [key, value.trim()])
      ) as FieldMap

      if (Object.values(sanitizedMap).some((v) => v === "")) {
        return null
      }

      const sanitizedCustomFields = newCustomFields
        .map((f) => ({ key: f.key.trim(), value: f.value.trim() }))
        .filter((f) => f.key.length > 0)

      return {
        ...settings,
        fieldMap: sanitizedMap,
        customFields: sanitizedCustomFields,
        apiTemplate: newTemplate,
        httpMethod: newHttpMethod
      }
    },
    [settings]
  )

  /**
   * Debounced save + restart for continuous changes (typing)
   */
  const debouncedSave = useCallback(
    (
      newFieldMap: FieldMap,
      newCustomFields: CustomField[],
      newTemplate: ApiTemplateName,
      newHttpMethod: HttpMethod
    ) => {
      const newSettings = buildSanitizedSettings(newFieldMap, newCustomFields, newTemplate, newHttpMethod)
      if (!newSettings) return

      debouncedSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [buildSanitizedSettings, setSettings, restartTracking, debouncedSaveAndRestart]
  )

  /**
   * Immediate save + restart for discrete changes (template switch, reset, remove)
   */
  const saveImmediately = useCallback(
    (
      newFieldMap: FieldMap,
      newCustomFields: CustomField[],
      newTemplate: ApiTemplateName,
      newHttpMethod: HttpMethod
    ) => {
      const newSettings = buildSanitizedSettings(newFieldMap, newCustomFields, newTemplate, newHttpMethod)
      if (!newSettings) return

      immediateSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [buildSanitizedSettings, setSettings, restartTracking, immediateSaveAndRestart]
  )

  /**
   * Handles template selection
   */
  const handleTemplateChange = useCallback(
    (template: ApiTemplateName) => {
      setLocalTemplate(template)

      if (template === "custom") {
        saveImmediately(localFieldMap, localCustomFields, template, localHttpMethod)
      } else {
        const tmpl = API_TEMPLATES[template]
        const method = tmpl.httpMethod ?? "POST"
        setLocalFieldMap(tmpl.fieldMap)
        setLocalCustomFields(tmpl.customFields)
        setLocalHttpMethod(method)
        saveImmediately(tmpl.fieldMap, tmpl.customFields, template, method)
      }
    },
    [localFieldMap, localCustomFields, localHttpMethod, saveImmediately]
  )

  /**
   * Handles field value changes with auto-save.
   * Switching to "custom" template if a known template was selected.
   */
  const handleFieldChange = useCallback(
    (key: keyof FieldMap, value: string) => {
      const newFieldMap = { ...localFieldMap, [key]: value }
      setLocalFieldMap(newFieldMap)

      const newTemplate = localTemplate !== "custom" ? "custom" : localTemplate
      if (newTemplate !== localTemplate) setLocalTemplate(newTemplate)

      debouncedSave(newFieldMap, localCustomFields, newTemplate, localHttpMethod)
    },
    [localFieldMap, localCustomFields, localTemplate, localHttpMethod, debouncedSave]
  )

  /**
   * Reset single field to current template default
   */
  const handleResetField = useCallback(
    (key: keyof FieldMap) => {
      const newFieldMap = { ...localFieldMap, [key]: referenceFieldMap[key] }
      setLocalFieldMap(newFieldMap)
      saveImmediately(newFieldMap, localCustomFields, localTemplate, localHttpMethod)
    },
    [localFieldMap, localCustomFields, localTemplate, localHttpMethod, referenceFieldMap, saveImmediately]
  )

  /**
   * Resets all fields to current template defaults
   */
  const handleResetAll = useCallback(() => {
    const refFields = getReferenceCustomFields(localTemplate)
    setLocalFieldMap(referenceFieldMap)
    setLocalCustomFields(refFields)
    saveImmediately(referenceFieldMap, refFields, localTemplate, localHttpMethod)
  }, [referenceFieldMap, localTemplate, localHttpMethod, saveImmediately])

  // --- Custom Fields handlers ---

  const handleAddCustomField = useCallback(() => {
    const newFields = [...localCustomFields, { key: "", value: "" }]
    setLocalCustomFields(newFields)
  }, [localCustomFields])

  const handleCustomFieldChange = useCallback(
    (index: number, field: "key" | "value", text: string) => {
      const newFields = [...localCustomFields]
      newFields[index] = { ...newFields[index], [field]: text }
      setLocalCustomFields(newFields)

      const newTemplate = localTemplate !== "custom" ? "custom" : localTemplate
      if (newTemplate !== localTemplate) setLocalTemplate(newTemplate)

      debouncedSave(localFieldMap, newFields, newTemplate, localHttpMethod)
    },
    [localCustomFields, localFieldMap, localTemplate, localHttpMethod, debouncedSave]
  )

  const handleRemoveCustomField = useCallback(
    (index: number) => {
      const newFields = localCustomFields.filter((_, i) => i !== index)
      setLocalCustomFields(newFields)

      const newTemplate = localTemplate !== "custom" ? "custom" : localTemplate
      if (newTemplate !== localTemplate) setLocalTemplate(newTemplate)

      saveImmediately(localFieldMap, newFields, newTemplate, localHttpMethod)
    },
    [localCustomFields, localFieldMap, localTemplate, localHttpMethod, saveImmediately]
  )

  const handleHttpMethodChange = useCallback(
    (method: HttpMethod) => {
      setLocalHttpMethod(method)

      const newTemplate = localTemplate !== "custom" ? "custom" : localTemplate
      if (newTemplate !== localTemplate) setLocalTemplate(newTemplate)

      saveImmediately(localFieldMap, localCustomFields, newTemplate, method)
    },
    [localFieldMap, localCustomFields, localTemplate, saveImmediately]
  )

  // Check if any field mapping is modified from the reference
  const hasModifications = (Object.keys(DEFAULT_FIELD_MAP) as Array<keyof FieldMap>).some((key) => isModified(key))

  // Build example payload string showing all fields
  const examplePayload = (() => {
    const params: { key: string; value: string }[] = []

    // Custom static fields first
    localCustomFields.forEach((f) => {
      if (f.key) params.push({ key: f.key, value: f.value })
    })

    // All mapped fields with realistic example values
    params.push({ key: localFieldMap.lat, value: "52.12345" })
    params.push({ key: localFieldMap.lon, value: "-2.12345" })
    params.push({ key: localFieldMap.acc, value: "15" })
    if (localFieldMap.alt) params.push({ key: localFieldMap.alt, value: "380" })
    if (localFieldMap.vel) params.push({ key: localFieldMap.vel, value: "5" })
    if (localFieldMap.batt) params.push({ key: localFieldMap.batt, value: "85" })
    if (localFieldMap.bs) params.push({ key: localFieldMap.bs, value: "2" })
    if (localFieldMap.tst) params.push({ key: localFieldMap.tst, value: "1739362800" })
    if (localFieldMap.bear) params.push({ key: localFieldMap.bear, value: "180.0" })

    if (localHttpMethod === "GET") {
      const query = params.map((p) => `${p.key}=${p.value}`).join("&")
      return `GET https://...?${query}`
    }

    const entries = params.map((p) => `  "${p.key}": ${isNaN(Number(p.value)) ? `"${p.value}"` : p.value}`)
    return "{\n" + entries.join(",\n") + "\n}"
  })()

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>API Field Mapping</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Customize field names sent to your server
          </Text>
        </View>

        {/* Template Selector */}
        <View style={styles.section}>
          <SectionTitle>BACKEND TEMPLATE</SectionTitle>
          <View style={styles.chipRow}>
            {TEMPLATE_OPTIONS.map(({ value, label }) => {
              const isSelected = localTemplate === value
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.chip,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background
                    },
                    isSelected && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "20"
                    }
                  ]}
                  onPress={() => handleTemplateChange(value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isSelected ? colors.primary : colors.text
                      }
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {localTemplate !== "custom" && (
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
              {API_TEMPLATES[localTemplate].description}
            </Text>
          )}
        </View>

        {/* HTTP Method Selector */}
        <View style={styles.section}>
          <SectionTitle>HTTP METHOD</SectionTitle>
          <View style={styles.chipRow}>
            {HTTP_METHOD_OPTIONS.map(({ value, label }) => {
              const isSelected = localHttpMethod === value
              return (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.chip,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background
                    },
                    isSelected && {
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "20"
                    }
                  ]}
                  onPress={() => handleHttpMethodChange(value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isSelected ? colors.primary : colors.text
                      }
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {localHttpMethod === "GET" && (
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
              Fields sent as URL query parameters instead of JSON body
            </Text>
          )}
        </View>

        {/* Field Mapping Section */}
        <View style={styles.fieldsSection}>
          <View style={styles.sectionHeader}>
            <SectionTitle>FIELD MAPPINGS</SectionTitle>
            {hasModifications && (
              <TouchableOpacity onPress={handleResetAll} style={styles.resetAllButton}>
                <Text style={[styles.resetAllText, { color: colors.primaryDark }]}>RESET ALL</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(Object.keys(DEFAULT_FIELD_MAP) as Array<keyof FieldMap>).map((key, index) => (
              <View key={key}>
                {/* Two-column layout */}
                <View style={styles.fieldRow}>
                  {/* Left: Key info */}
                  <View style={styles.keyColumn}>
                    <View style={styles.keyHeader}>
                      <Text style={[styles.fieldLabel, { color: colors.text }]}>{key.toUpperCase()}</Text>
                      {isModified(key) && (
                        <View style={[styles.modifiedBadge, { backgroundColor: colors.primary }]}>
                          <Text style={[styles.modifiedText, { color: colors.textOnPrimary }]}>Modified</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.fieldDescription, { color: colors.textSecondary }]} numberOfLines={1}>
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
                            backgroundColor: colors.background
                          }
                        ]}
                        value={localFieldMap[key]}
                        onChangeText={(text) => handleFieldChange(key, text)}
                        placeholder={referenceFieldMap[key]}
                        placeholderTextColor={colors.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {isModified(key) && (
                        <TouchableOpacity
                          onPress={() => handleResetField(key)}
                          style={[styles.resetButton, { backgroundColor: colors.border }]}
                        >
                          <Text style={[styles.resetIcon, { color: colors.textSecondary }]}>↺</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>

                {index < Object.keys(DEFAULT_FIELD_MAP).length - 1 && <Divider />}
              </View>
            ))}
          </View>
        </View>

        {/* Custom Fields Section */}
        <View style={styles.fieldsSection}>
          <View style={styles.sectionHeader}>
            <SectionTitle>CUSTOM FIELDS</SectionTitle>
          </View>

          <View style={[styles.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {localCustomFields.length === 0 ? (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                No custom fields. Add static key-value pairs to include in every payload.
              </Text>
            ) : (
              localCustomFields.map((field, index) => (
                <View key={index}>
                  <View style={styles.customFieldRow}>
                    <TextInput
                      style={[
                        styles.customFieldInput,
                        {
                          borderColor: colors.border,
                          color: colors.text,
                          backgroundColor: colors.background
                        }
                      ]}
                      value={field.key}
                      onChangeText={(text) => handleCustomFieldChange(index, "key", text)}
                      placeholder="Key"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={[
                        styles.customFieldInput,
                        {
                          borderColor: colors.border,
                          color: colors.text,
                          backgroundColor: colors.background
                        }
                      ]}
                      value={field.value}
                      onChangeText={(text) => handleCustomFieldChange(index, "value", text)}
                      placeholder="Value"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={() => handleRemoveCustomField(index)}
                      style={[styles.removeButton, { backgroundColor: colors.error + "15" }]}
                    >
                      <Text style={[styles.removeButtonText, { color: colors.error }]}>X</Text>
                    </TouchableOpacity>
                  </View>
                  {index < localCustomFields.length - 1 && <Divider />}
                </View>
              ))
            )}

            <TouchableOpacity onPress={handleAddCustomField} style={[styles.addButton, { borderColor: colors.border }]}>
              <Text style={[styles.addButtonText, { color: colors.primaryDark }]}>+ Add Field</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Example payload preview */}
        <View style={styles.exampleSection}>
          <SectionTitle>{localHttpMethod === "GET" ? "EXAMPLE REQUEST" : "EXAMPLE PAYLOAD"}</SectionTitle>
          <View
            style={[
              styles.exampleCard,
              {
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.border
              }
            ]}
          >
            <Text style={[styles.exampleCode, { color: colors.textSecondary }]}>{examplePayload}</Text>
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
      <FloatingSaveIndicator saving={saving} success={saveSuccess} colors={colors} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  header: {
    marginTop: 20,
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    letterSpacing: -0.5,
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20
  },
  section: {
    marginBottom: 24
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  chipText: {
    fontSize: 12,
    ...fonts.bold
  },
  templateHint: {
    fontSize: 12,
    marginTop: 8
  },
  fieldsSection: {
    marginBottom: 20
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  resetAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  resetAllText: {
    fontSize: 11,
    ...fonts.bold,
    letterSpacing: 0.5
  },
  fieldsCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1
  },
  fieldRow: {
    flexDirection: "row",
    paddingVertical: 10,
    gap: 12
  },
  keyColumn: {
    flex: 1,
    justifyContent: "center"
  },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2
  },
  fieldLabel: {
    fontSize: 13,
    ...fonts.bold,
    letterSpacing: 0.5
  },
  modifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  modifiedText: {
    fontSize: 9,
    ...fonts.bold,
    letterSpacing: 0.3
  },
  fieldDescription: {
    fontSize: 11,
    lineHeight: 15
  },
  valueColumn: {
    flex: 1,
    justifyContent: "center"
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  fieldInput: {
    flex: 1,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "monospace"
  },
  resetButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center"
  },
  resetIcon: {
    fontSize: 18,
    ...fonts.semiBold
  },
  customFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8
  },
  customFieldInput: {
    flex: 1,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "monospace"
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center"
  },
  removeButtonText: {
    fontSize: 13,
    ...fonts.bold
  },
  addButton: {
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginTop: 8
  },
  addButtonText: {
    fontSize: 14,
    ...fonts.semiBold
  },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 8
  },
  exampleSection: {
    marginBottom: 20
  },
  exampleCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1
  },
  exampleCode: {
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 18
  },
  footer: {
    paddingVertical: 16,
    alignItems: "center"
  },
  footerText: {
    fontSize: 11,
    textAlign: "center"
  }
})
