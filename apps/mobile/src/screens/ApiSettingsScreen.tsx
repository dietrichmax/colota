/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Text, StyleSheet, View, ScrollView, Pressable } from "react-native"
import { RotateCcw, X } from "lucide-react-native"
import {
  FieldMap,
  DEFAULT_FIELD_MAP,
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
import { fontSizes, fonts, lineHeights, type } from "../styles/typography"
import type { RootScreenProps } from "../types/navigation"
import {
  SectionTitle,
  FloatingSaveIndicator,
  Container,
  Divider,
  Card,
  ListItem,
  RadioRow,
  Button,
  TextField,
  IconButton
} from "../components"
import { findDuplicates } from "../utils/settingsValidation"
import {
  buildTraccarJsonPayload,
  buildOverlandBatchPayload,
  isTraccarJsonFormat,
  isOverlandFormat
} from "../utils/apiPayload"
import { HIT_SLOP_LG, space, STATE_LAYER_ALPHA } from "../constants"
import { radius } from "@colota/shared"

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

const HTTP_METHOD_OPTIONS: { value: HttpMethod; label: string; sub: string }[] = [
  { value: "POST", label: "POST", sub: "Sends the fields as a JSON body" },
  { value: "GET", label: "GET", sub: "Sends the fields as URL query parameters" }
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
export function ApiSettingsScreen({ navigation, route }: RootScreenProps<"Request Format">) {
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
  const batchDisabledReason = isInstantSync ? "Needs a sync interval above Instant" : "Needs the POST method, not GET"
  const copiedTimeout = useTimeout()
  const {
    saving,
    message: saveMessage,
    isError: saveIsError,
    debouncedSaveAndRestart,
    immediateSaveAndRestart
  } = useAutoSave()

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

  // The picker hands its choice back through the route. Clearing the param afterwards stops the
  // effect re-applying it on every later render of this screen.
  const incomingTemplate = route.params?.template
  useEffect(() => {
    if (!incomingTemplate) return
    if (incomingTemplate !== localTemplate) handleTemplateChange(incomingTemplate)
    navigation.setParams({ template: undefined })
  }, [incomingTemplate, localTemplate, handleTemplateChange, navigation])

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
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Customize field names sent to your server
          </Text>
        </View>

        {/* Template Selector */}
        <View style={styles.section}>
          <SectionTitle>Backend template</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-backend-template"
              label={localTemplate === "custom" ? "Custom" : API_TEMPLATES[localTemplate].label}
              sub={
                localTemplate === "custom"
                  ? "Your own field names, mapped by hand"
                  : API_TEMPLATES[localTemplate].description
              }
              onPress={() => navigation.navigate("Backend Template", { selected: localTemplate })}
            />
          </Card>
        </View>

        {/* HTTP Method Selector */}
        {/* Overland template is POST-only by spec; no need to expose the choice */}
        {localTemplate !== "overland" && (
          <View style={styles.section}>
            <SectionTitle>HTTP method</SectionTitle>
            <View accessibilityRole="radiogroup" style={styles.radioGroup}>
              {HTTP_METHOD_OPTIONS.map(({ value, label, sub }) => (
                <RadioRow
                  key={value}
                  testID={`http-method-${value.toLowerCase()}`}
                  label={label}
                  sub={sub}
                  selected={localHttpMethod === value}
                  onPress={() => handleHttpMethodChange(value)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Dawarich Mode Selector (Dawarich template only) */}
        {showDawarichChip && (
          <View style={styles.section}>
            <SectionTitle>Dawarich mode</SectionTitle>
            <View accessibilityRole="radiogroup" style={styles.radioGroup}>
              <RadioRow
                testID="dawarich-mode-single"
                label="Single point"
                sub="Sends one request per location"
                selected={localDawarichMode === "single"}
                onPress={() => handleDawarichModeChange("single")}
              />
              <RadioRow
                testID="dawarich-mode-batch"
                label="Batch"
                sub={batchDisabled ? batchDisabledReason : "Sends queued locations in one request"}
                disabled={batchDisabled}
                selected={localDawarichMode === "batch"}
                onPress={() => handleDawarichModeChange("batch")}
              />
            </View>
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
              {localDawarichMode === "batch"
                ? "Endpoint: /api/v1/overland/batches?api_key=YOUR_API_KEY"
                : "Endpoint: /api/v1/owntracks/points?api_key=YOUR_API_KEY"}
            </Text>
          </View>
        )}

        {/* Field Mapping Section */}
        <View style={styles.fieldsSection}>
          <View style={styles.sectionHeader}>
            <SectionTitle>Field mappings</SectionTitle>
            {hasModifications && (
              <Pressable
                onPress={handleResetAll}
                hitSlop={HIT_SLOP_LG}
                accessibilityRole="button"
                android_ripple={{ color: colors.primaryDark + STATE_LAYER_ALPHA, borderless: true }}
                style={styles.resetAllButton}
              >
                <Text style={[styles.resetAllText, { color: colors.primaryDark }]}>Reset all</Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.fieldsCard, { backgroundColor: colors.card }]}>
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
                        <TextField
                          accessibilityLabel={key}
                          testID={`field-${key}`}
                          style={styles.fieldInput}
                          mono
                          error={isDuplicate}
                          value={localFieldMap[key]}
                          onChangeText={(text) => handleFieldChange(key, text)}
                          placeholder={referenceFieldMap[key]}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                        {isFieldModified && (
                          <IconButton
                            icon={RotateCcw}
                            testID={`reset-${key}`}
                            accessibilityLabel={`Reset ${key} to the default`}
                            onPress={() => handleResetField(key)}
                          />
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
            <SectionTitle>Custom fields</SectionTitle>
          </View>

          <View style={[styles.fieldsCard, { backgroundColor: colors.card }]}>
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
                      <TextField
                        accessibilityLabel="Custom field key"
                        testID={`custom-key-${field.id}`}
                        style={styles.customFieldInput}
                        mono
                        error={isDuplicate}
                        value={field.key}
                        onChangeText={(text) => handleCustomFieldChange(field.id, "key", text)}
                        placeholder="Key"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TextField
                        accessibilityLabel="Custom field value"
                        testID={`custom-value-${field.id}`}
                        style={styles.customFieldInput}
                        mono
                        value={field.value}
                        onChangeText={(text) => handleCustomFieldChange(field.id, "value", text)}
                        placeholder="Value"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <IconButton
                        icon={X}
                        tone="danger"
                        testID={`remove-custom-${field.id}`}
                        accessibilityLabel="Remove this custom field"
                        onPress={() => handleRemoveCustomField(field.id)}
                      />
                    </View>
                    {index < localCustomFields.length - 1 && <Divider />}
                  </View>
                )
              })
            )}

            <Button title="+ Add Field" onPress={handleAddCustomField} variant="secondary" />
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
          <SectionTitle>{localHttpMethod === "GET" ? "Example request" : "Example payload"}</SectionTitle>
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
              hitSlop={HIT_SLOP_LG}
              accessibilityRole="button"
              android_ripple={{ color: colors.primaryDark + STATE_LAYER_ALPHA, borderless: true }}
              style={styles.copyButton}
            >
              <Text style={[styles.copyButtonText, { color: copied ? colors.success : colors.primaryDark }]}>
                {copied ? "Copied!" : "Copy"}
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
      <FloatingSaveIndicator saving={saving} message={saveMessage} isError={saveIsError} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl
  },
  header: {
    marginTop: space.xl,
    marginBottom: space.xl
  },
  subtitle: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body
  },
  section: {
    marginBottom: space.xl
  },
  // Every control pays its own top padding, so the gap under a SectionTitle has to be measured to the
  // text rather than to the box. A chip pays space.sm and lands at 20; a row pays space.lg and would
  // land at 28. Pulling up space.sm puts the row text at 20 too, with the ripple still clear of the title.
  radioGroup: {
    marginTop: -space.sm
  },
  templateHint: {
    fontSize: fontSizes.caption,
    marginTop: space.sm
  },
  fieldsSection: {
    marginBottom: space.xl
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  resetAllButton: {
    paddingVertical: space.xs,
    paddingHorizontal: space.sm
  },
  resetAllText: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  fieldsCard: {
    padding: space.md,
    borderRadius: radius.md
  },
  fieldRow: {
    flexDirection: "row",
    paddingVertical: space.md,
    gap: space.md
  },
  keyColumn: {
    flex: 1,
    justifyContent: "center"
  },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.xxs
  },
  fieldLabel: {
    fontSize: fontSizes.description,
    ...fonts.bold
  },
  modifiedBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.xs
  },
  modifiedText: {
    fontSize: fontSizes.micro,
    ...fonts.bold
  },
  fieldDescription: {
    fontSize: fontSizes.small,
    lineHeight: lineHeights.small
  },
  valueColumn: {
    flex: 1,
    justifyContent: "center"
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  fieldInput: {
    flex: 1
  },
  customFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm
  },
  customFieldInput: {
    flex: 1
  },
  emptyHint: {
    fontSize: fontSizes.description,
    textAlign: "center",
    paddingVertical: space.sm
  },
  warningBanner: {
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: space.xl
  },
  warningText: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption
  },
  exampleSection: {
    marginBottom: space.xl
  },
  copyButton: {
    alignSelf: "flex-end",
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    marginTop: space.sm
  },
  copyButtonText: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  exampleCard: {
    padding: space.lg,
    borderRadius: radius.sm
  },
  exampleCode: {
    ...type.mono
  },
  footer: {
    paddingVertical: space.lg,
    alignItems: "center"
  },
  footerText: {
    fontSize: fontSizes.small,
    textAlign: "center"
  }
})
