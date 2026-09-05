/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback, useMemo, useRef } from "react"
import { Text, StyleSheet, TextInput, View, ScrollView, Pressable } from "react-native"
import {
  FieldMap,
  DEFAULT_FIELD_MAP,
  ScreenProps,
  CustomField,
  ApiTemplateName,
  API_TEMPLATES,
  HttpMethod,
  DawarichMode
} from "../types/global"
import { useTheme } from "../hooks/useTheme"
import { useAutoSave } from "../hooks/useAutoSave"
import { useTimeout } from "../hooks/useTimeout"
import { useTracking } from "../contexts/TrackingProvider"
import NativeLocationService from "../services/NativeLocationService"
import { fonts } from "../styles/typography"
import { SectionTitle, FloatingSaveIndicator, Container, Divider, ChipGroup } from "../components"
import { findDuplicates } from "../utils/settingsValidation"
import {
  buildTraccarJsonPayload,
  buildOverlandBatchPayload,
  isTraccarJsonFormat,
  isOverlandFormat
} from "../utils/apiPayload"

type LocalCustomField = CustomField & { id: number }

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
  ...Object.entries(API_TEMPLATES).map(([key, tmpl]) => ({
    value: key as ApiTemplateName,
    label: tmpl.label
  }))
]

const HTTP_METHOD_OPTIONS: { value: HttpMethod; label: string }[] = [
  { value: "POST", label: "POST" },
  { value: "GET", label: "GET" }
]

const DAWARICH_MODE_OPTIONS: { value: DawarichMode; label: string }[] = [
  { value: "single", label: "Single point" },
  { value: "batch", label: "Batch" }
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

  const nextIdRef = useRef(0)
  const assignId = () => nextIdRef.current++

  const [localFieldMap, setLocalFieldMap] = useState<FieldMap>(settings.fieldMap || DEFAULT_FIELD_MAP)
  const [localCustomFields, setLocalCustomFields] = useState<LocalCustomField[]>(() =>
    (settings.customFields || []).map((f) => ({ ...f, id: assignId() }))
  )
  const [localTemplate, setLocalTemplate] = useState<ApiTemplateName>(settings.apiTemplate || "custom")
  const [localHttpMethod, setLocalHttpMethod] = useState<HttpMethod>(settings.httpMethod || "POST")
  const [localDawarichMode, setLocalDawarichMode] = useState<DawarichMode>(settings.dawarichMode || "single")
  const [copied, setCopied] = useState(false)
  const isInstantSync = settings.syncInterval === 0
  const isGetMethod = localHttpMethod === "GET"
  const showDawarichChip = localTemplate === "dawarich"
  const batchDisabled = isInstantSync || isGetMethod
  const copiedTimeout = useTimeout()
  const { saving, saveSuccess, debouncedSaveAndRestart, immediateSaveAndRestart } = useAutoSave()

  const referenceFieldMap = getReferenceFieldMap(localTemplate)

  /** Set of field keys that differ from the current template's defaults */
  const modifiedFields = useMemo(() => {
    const set = new Set<keyof FieldMap>()
    for (const key of Object.keys(referenceFieldMap) as Array<keyof FieldMap>) {
      if (localFieldMap[key] !== referenceFieldMap[key]) set.add(key)
    }
    return set
  }, [localFieldMap, referenceFieldMap])

  const hasModifications = modifiedFields.size > 0

  /** Set of field names that appear more than once across field map values and custom field keys */
  const duplicateFieldNames = useMemo(() => {
    const allNames: string[] = []
    for (const v of Object.values(localFieldMap)) {
      if (v && v.trim()) allNames.push(v.trim())
    }
    for (const f of localCustomFields) {
      if (f.key.trim()) allNames.push(f.key.trim())
    }
    return findDuplicates(allNames)
  }, [localFieldMap, localCustomFields])

  /** Example payload string showing all fields */
  const examplePayload = useMemo(() => {
    const isTraccarJson = isTraccarJsonFormat(localTemplate, localHttpMethod)
    const isOverland = isOverlandFormat(localTemplate, localDawarichMode)

    if (isOverland) {
      const deviceId =
        localCustomFields.find((f) => f.key === "device_id" || f.key === "tid" || f.key === "id")?.value ?? "colota"
      return JSON.stringify(
        buildOverlandBatchPayload({
          latitude: 52.12345,
          longitude: -2.12345,
          accuracy: 15,
          altitude: 380,
          speed: 5,
          course: 180,
          batteryLevel: 0.85,
          batteryState: "unplugged",
          deviceId,
          timestamp: "2025-02-12T13:00:00Z"
        }),
        null,
        2
      )
    }

    if (isTraccarJson) {
      const deviceId = localCustomFields.find((f) => f.key === "id" || f.key === "device_id")?.value ?? "colota"
      return JSON.stringify(
        buildTraccarJsonPayload({
          latitude: 52.12345,
          longitude: -2.12345,
          accuracy: 15,
          altitude: 380,
          speed: 5,
          heading: 180,
          batteryLevel: 0.85,
          isCharging: false,
          deviceId,
          timestamp: "2025-02-12T13:00:00Z"
        }),
        null,
        2
      )
    }

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
  }, [localFieldMap, localCustomFields, localHttpMethod, localTemplate, localDawarichMode])

  /**
   * Build sanitized settings from current field map, custom fields, and template.
   * Returns null if validation fails (empty field mappings).
   */
  const buildSanitizedSettings = useCallback(
    (
      newFieldMap: FieldMap,
      newCustomFields: CustomField[],
      newTemplate: ApiTemplateName,
      newHttpMethod: HttpMethod,
      newDawarichMode: DawarichMode
    ) => {
      const sanitizedMap = Object.fromEntries(
        Object.entries(newFieldMap).map(([key, value]) => [key, value.trim()])
      ) as FieldMap

      if (Object.values(sanitizedMap).some((v) => v === "")) {
        return null
      }

      // Block saving when duplicate field names exist
      const allNames: string[] = [
        ...Object.values(sanitizedMap).filter((v) => v),
        ...newCustomFields.map((f) => f.key.trim()).filter((k) => k)
      ]
      if (new Set(allNames).size !== allNames.length) {
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
        httpMethod: newHttpMethod,
        dawarichMode: newDawarichMode
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
      newHttpMethod: HttpMethod,
      newDawarichMode: DawarichMode
    ) => {
      const newSettings = buildSanitizedSettings(
        newFieldMap,
        newCustomFields,
        newTemplate,
        newHttpMethod,
        newDawarichMode
      )
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
      newHttpMethod: HttpMethod,
      newDawarichMode: DawarichMode
    ) => {
      const newSettings = buildSanitizedSettings(
        newFieldMap,
        newCustomFields,
        newTemplate,
        newHttpMethod,
        newDawarichMode
      )
      if (!newSettings) return

      immediateSaveAndRestart(
        () => setSettings(newSettings),
        () => restartTracking(newSettings)
      )
    },
    [buildSanitizedSettings, setSettings, restartTracking, immediateSaveAndRestart]
  )

  /**
   * Handles template selection — applies the template's field map, custom fields, and HTTP method.
   */
  const handleTemplateChange = useCallback(
    (template: ApiTemplateName) => {
      setLocalTemplate(template)

      // Reset to "single" when leaving dawarich so the saved value doesn't silently
      // flip behavior the next time the user picks dawarich again.
      const nextDawarichMode: DawarichMode = template === "dawarich" ? localDawarichMode : "single"
      if (nextDawarichMode !== localDawarichMode) setLocalDawarichMode(nextDawarichMode)

      if (template === "custom") {
        saveImmediately(localFieldMap, localCustomFields, template, localHttpMethod, nextDawarichMode)
        return
      }

      const tmpl = API_TEMPLATES[template]
      const method = tmpl.httpMethod ?? "POST"
      const newCustomFields = tmpl.customFields.map((f) => ({ ...f, id: assignId() }))
      setLocalFieldMap(tmpl.fieldMap)
      setLocalCustomFields(newCustomFields)
      setLocalHttpMethod(method)
      saveImmediately(tmpl.fieldMap, newCustomFields, template, method, nextDawarichMode)
    },
    [localFieldMap, localCustomFields, localHttpMethod, localDawarichMode, saveImmediately]
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

      debouncedSave(newFieldMap, localCustomFields, newTemplate, localHttpMethod, localDawarichMode)
    },
    [localFieldMap, localCustomFields, localTemplate, localHttpMethod, localDawarichMode, debouncedSave]
  )

  /**
   * Reset single field to current template default
   */
  const handleResetField = useCallback(
    (key: keyof FieldMap) => {
      const newFieldMap = { ...localFieldMap, [key]: referenceFieldMap[key] }
      setLocalFieldMap(newFieldMap)
      saveImmediately(newFieldMap, localCustomFields, localTemplate, localHttpMethod, localDawarichMode)
    },
    [
      localFieldMap,
      localCustomFields,
      localTemplate,
      localHttpMethod,
      localDawarichMode,
      referenceFieldMap,
      saveImmediately
    ]
  )

  /**
   * Resets all fields to current template defaults
   */
  const handleResetAll = useCallback(() => {
    const refFields = getReferenceCustomFields(localTemplate).map((f) => ({ ...f, id: assignId() }))
    setLocalFieldMap(referenceFieldMap)
    setLocalCustomFields(refFields)
    saveImmediately(referenceFieldMap, refFields, localTemplate, localHttpMethod, localDawarichMode)
  }, [referenceFieldMap, localTemplate, localHttpMethod, localDawarichMode, saveImmediately])

  // --- Custom Fields handlers ---

  const handleAddCustomField = useCallback(() => {
    const newFields = [...localCustomFields, { key: "", value: "", id: assignId() }]
    setLocalCustomFields(newFields)
  }, [localCustomFields])

  const handleCustomFieldChange = useCallback(
    (id: number, field: "key" | "value", text: string) => {
      const newFields = localCustomFields.map((f) => (f.id === id ? { ...f, [field]: text } : f))
      setLocalCustomFields(newFields)

      // Only reset template when changing a key, not a value
      let newTemplate = localTemplate
      if (field === "key" && localTemplate !== "custom") {
        newTemplate = "custom"
        setLocalTemplate(newTemplate)
      }

      debouncedSave(localFieldMap, newFields, newTemplate, localHttpMethod, localDawarichMode)
    },
    [localCustomFields, localFieldMap, localTemplate, localHttpMethod, localDawarichMode, debouncedSave]
  )

  const handleRemoveCustomField = useCallback(
    (id: number) => {
      const newFields = localCustomFields.filter((f) => f.id !== id)
      setLocalCustomFields(newFields)

      const newTemplate = localTemplate !== "custom" ? "custom" : localTemplate
      if (newTemplate !== localTemplate) setLocalTemplate(newTemplate)

      saveImmediately(localFieldMap, newFields, newTemplate, localHttpMethod, localDawarichMode)
    },
    [localCustomFields, localFieldMap, localTemplate, localHttpMethod, localDawarichMode, saveImmediately]
  )

  const handleHttpMethodChange = useCallback(
    (method: HttpMethod) => {
      setLocalHttpMethod(method)

      // Batch requires POST; revert to single if the user picks GET while in batch
      // so the saved state matches the disabled chip.
      const nextDawarichMode: DawarichMode =
        method === "GET" && localDawarichMode === "batch" ? "single" : localDawarichMode
      if (nextDawarichMode !== localDawarichMode) setLocalDawarichMode(nextDawarichMode)

      saveImmediately(localFieldMap, localCustomFields, localTemplate, method, nextDawarichMode)
    },
    [localFieldMap, localCustomFields, localTemplate, localDawarichMode, saveImmediately]
  )

  const handleDawarichModeChange = useCallback(
    (mode: DawarichMode) => {
      setLocalDawarichMode(mode)

      // Reseed the default custom field on mode flip, but only when the list still
      // matches the previous mode's default (i.e. the user hasn't edited it).
      const prevDefault = mode === "batch" ? "_type" : "device_id"
      const nextDefault = mode === "batch" ? "device_id" : "_type"
      const nextDefaultValue = mode === "batch" ? "colota" : "location"
      const looksLikeOldDefault = localCustomFields.length === 1 && localCustomFields[0]?.key === prevDefault
      const newCustomFields = looksLikeOldDefault
        ? [{ key: nextDefault, value: nextDefaultValue, id: assignId() }]
        : localCustomFields
      if (looksLikeOldDefault) setLocalCustomFields(newCustomFields)

      saveImmediately(localFieldMap, newCustomFields, localTemplate, localHttpMethod, mode)
    },
    [localFieldMap, localCustomFields, localTemplate, localHttpMethod, saveImmediately]
  )

  const handleCopyPayload = useCallback(async () => {
    try {
      await NativeLocationService.copyToClipboard(examplePayload, "API Payload")
      setCopied(true)
      copiedTimeout.set(() => setCopied(false), 2000)
    } catch {
      // Copy failed — no action needed
    }
  }, [examplePayload, copiedTimeout])

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
          <ChipGroup
            options={TEMPLATE_OPTIONS}
            selected={localTemplate}
            onSelect={handleTemplateChange}
            colors={colors}
          />
          {localTemplate !== "custom" && (
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
              {API_TEMPLATES[localTemplate].description}
            </Text>
          )}
        </View>

        {/* HTTP Method Selector */}
        {/* Overland template is POST-only by spec; no need to expose the choice */}
        {localTemplate !== "overland" && (
          <View style={styles.section}>
            <SectionTitle>HTTP METHOD</SectionTitle>
            <ChipGroup
              options={HTTP_METHOD_OPTIONS}
              selected={localHttpMethod}
              onSelect={handleHttpMethodChange}
              colors={colors}
            />
            {localHttpMethod === "GET" && (
              <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
                Fields sent as URL query parameters instead of JSON body
              </Text>
            )}
          </View>
        )}

        {/* Dawarich Mode Selector (Dawarich template only) */}
        {showDawarichChip && (
          <View style={styles.section}>
            <SectionTitle>DAWARICH MODE</SectionTitle>
            <ChipGroup
              options={DAWARICH_MODE_OPTIONS}
              selected={localDawarichMode}
              onSelect={handleDawarichModeChange}
              colors={colors}
              disabled={batchDisabled ? new Set<DawarichMode>(["batch"]) : undefined}
            />
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
              {localDawarichMode === "batch"
                ? "Endpoint: /api/v1/overland/batches?api_key=YOUR_API_KEY"
                : "Endpoint: /api/v1/owntracks/points?api_key=YOUR_API_KEY"}
            </Text>
            {isInstantSync && (
              <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
                Batch mode requires a non-zero sync interval. Switch to a batched preset to enable it.
              </Text>
            )}
            {isGetMethod && !isInstantSync && (
              <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
                Batch mode requires POST. Switch HTTP method to POST to enable batch.
              </Text>
            )}
          </View>
        )}

        {/* Field Mapping Section */}
        <View style={styles.fieldsSection}>
          <View style={styles.sectionHeader}>
            <SectionTitle>FIELD MAPPINGS</SectionTitle>
            {hasModifications && (
              <Pressable
                onPress={handleResetAll}
                style={({ pressed }) => [styles.resetAllButton, pressed && { opacity: colors.pressedOpacity }]}
              >
                <Text style={[styles.resetAllText, { color: colors.primaryDark }]}>RESET ALL</Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(Object.keys(DEFAULT_FIELD_MAP) as Array<keyof FieldMap>).map((key, index) => {
              const isFieldModified = modifiedFields.has(key)
              const fieldValue = localFieldMap[key]?.trim()
              const isDuplicate = fieldValue != null && duplicateFieldNames.has(fieldValue)
              return (
                <View key={key}>
                  {/* Two-column layout */}
                  <View style={styles.fieldRow}>
                    {/* Left: Key info */}
                    <View style={styles.keyColumn}>
                      <View style={styles.keyHeader}>
                        <Text style={[styles.fieldLabel, { color: colors.text }]}>{key.toUpperCase()}</Text>
                        {isFieldModified && (
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
                              borderColor: isDuplicate
                                ? colors.error
                                : isFieldModified
                                  ? colors.primary
                                  : colors.border,
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
                        {isFieldModified && (
                          <Pressable
                            onPress={() => handleResetField(key)}
                            style={({ pressed }) => [
                              styles.resetButton,
                              { backgroundColor: colors.border },
                              pressed && { opacity: colors.pressedOpacity }
                            ]}
                          >
                            <Text style={[styles.resetIcon, { color: colors.textSecondary }]}>↺</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>

                  {index < Object.keys(DEFAULT_FIELD_MAP).length - 1 && <Divider />}
                </View>
              )
            })}
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
              localCustomFields.map((field, index) => {
                const isDuplicate = duplicateFieldNames.has(field.key.trim())
                return (
                  <View key={field.id}>
                    <View style={styles.customFieldRow}>
                      <TextInput
                        style={[
                          styles.customFieldInput,
                          {
                            borderColor: isDuplicate ? colors.error : colors.border,
                            color: colors.text,
                            backgroundColor: colors.background
                          }
                        ]}
                        value={field.key}
                        onChangeText={(text) => handleCustomFieldChange(field.id, "key", text)}
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
                        onChangeText={(text) => handleCustomFieldChange(field.id, "value", text)}
                        placeholder="Value"
                        placeholderTextColor={colors.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <Pressable
                        onPress={() => handleRemoveCustomField(field.id)}
                        style={({ pressed }) => [
                          styles.removeButton,
                          { backgroundColor: colors.error + "15" },
                          pressed && { opacity: colors.pressedOpacity }
                        ]}
                      >
                        <Text style={[styles.removeButtonText, { color: colors.error }]}>X</Text>
                      </Pressable>
                    </View>
                    {index < localCustomFields.length - 1 && <Divider />}
                  </View>
                )
              })
            )}

            <Pressable
              onPress={handleAddCustomField}
              style={({ pressed }) => [
                styles.addButton,
                { borderColor: colors.border },
                pressed && { opacity: colors.pressedOpacity }
              ]}
            >
              <Text style={[styles.addButtonText, { color: colors.primaryDark }]}>+ Add Field</Text>
            </Pressable>
          </View>
        </View>

        {/* Duplicate field warning */}
        {duplicateFieldNames.size > 0 && (
          <View
            style={[styles.warningBanner, { backgroundColor: colors.error + "15", borderColor: colors.error + "40" }]}
          >
            <Text style={[styles.warningText, { color: colors.error }]}>
              Duplicate field names: {[...duplicateFieldNames].join(", ")}. Resolve duplicates to save changes.
            </Text>
          </View>
        )}

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
            <Pressable
              onPress={handleCopyPayload}
              style={({ pressed }) => [styles.copyButton, pressed && { opacity: colors.pressedOpacity }]}
            >
              <Text style={[styles.copyButtonText, { color: copied ? colors.success : colors.primaryDark }]}>
                {copied ? "COPIED!" : "COPY"}
              </Text>
            </Pressable>
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
  warningBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18
  },
  exampleSection: {
    marginBottom: 20
  },
  copyButton: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginTop: 8
  },
  copyButtonText: {
    fontSize: 11,
    ...fonts.bold,
    letterSpacing: 0.5
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
