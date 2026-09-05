/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback, useMemo, useRef } from "react"
import { Text, StyleSheet, View, ScrollView, Pressable } from "react-native"
import { Plus, RotateCcw, X } from "lucide-react-native"
import { radius } from "@colota/shared"
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
import { useTranslation } from "../i18n/useTranslation"
import NativeLocationService from "../services/NativeLocationService"
import { text } from "../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../constants"
import { Button, ChipGroup, Container, Divider, Notice, SectionTitle, TextField, Toast } from "../components"
import { findDuplicates } from "../utils/settingsValidation"
import {
  buildTraccarJsonPayload,
  buildOverlandBatchPayload,
  isTraccarJsonFormat,
  isOverlandFormat
} from "../utils/apiPayload"

const COPIED_DISPLAY_MS = 2000

type LocalCustomField = CustomField & { id: number }

const FIELD_DESCRIPTION_KEYS: Record<keyof FieldMap, string> = {
  lat: "api.field.lat",
  lon: "api.field.lon",
  acc: "api.field.acc",
  alt: "api.field.alt",
  vel: "api.field.vel",
  batt: "api.field.batt",
  bs: "api.field.bs",
  tst: "api.field.tst",
  bear: "api.field.bear"
}

const HTTP_METHOD_OPTIONS: { value: HttpMethod; label: string }[] = [
  { value: "POST", label: "POST" },
  { value: "GET", label: "GET" }
]

/**
 * Returns the reference field map for the current template.
 * Used for the reset actions and for spotting a field that no longer matches its template.
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
  const { t } = useTranslation()

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

  const templateOptions = useMemo(
    () => [
      { value: "custom" as ApiTemplateName, label: t("api.template.custom") },
      ...Object.entries(API_TEMPLATES).map(([key, tmpl]) => ({
        value: key as ApiTemplateName,
        label: tmpl.label
      }))
    ],
    [t]
  )

  const dawarichModeOptions = useMemo(
    () => [
      { value: "single" as DawarichMode, label: t("api.dawarich.single") },
      { value: "batch" as DawarichMode, label: t("api.dawarich.batch") }
    ],
    [t]
  )

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
    (id: number, field: "key" | "value", value: string) => {
      const newFields = localCustomFields.map((f) => (f.id === id ? { ...f, [field]: value } : f))
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
      copiedTimeout.set(() => setCopied(false), COPIED_DISPLAY_MS)
    } catch {
      // Copy failed — no action needed
    }
  }, [examplePayload, copiedTimeout])

  const fieldKeys = Object.keys(DEFAULT_FIELD_MAP) as Array<keyof FieldMap>

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{t("api.intro")}</Text>

        <SectionTitle first>{t("api.backendTemplate")}</SectionTitle>
        <ChipGroup
          options={templateOptions}
          selected={localTemplate}
          onSelect={handleTemplateChange}
          accessibilityLabel={t("api.backendTemplate")}
        />
        {localTemplate !== "custom" && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{API_TEMPLATES[localTemplate].description}</Text>
        )}

        {/* Overland template is POST-only by spec; no need to expose the choice */}
        {localTemplate !== "overland" && (
          <>
            <SectionTitle>{t("api.httpMethod")}</SectionTitle>
            <ChipGroup
              options={HTTP_METHOD_OPTIONS}
              selected={localHttpMethod}
              onSelect={handleHttpMethodChange}
              accessibilityLabel={t("api.httpMethod")}
            />
            {isGetMethod && <Text style={[styles.hint, { color: colors.textSecondary }]}>{t("api.getHint")}</Text>}
          </>
        )}

        {showDawarichChip && (
          <>
            <SectionTitle>{t("api.dawarichMode")}</SectionTitle>
            <ChipGroup
              options={dawarichModeOptions}
              selected={localDawarichMode}
              onSelect={handleDawarichModeChange}
              disabled={batchDisabled ? new Set<DawarichMode>(["batch"]) : undefined}
              accessibilityLabel={t("api.dawarichMode")}
            />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {localDawarichMode === "batch" ? t("api.dawarich.batchEndpoint") : t("api.dawarich.singleEndpoint")}
            </Text>
            {isInstantSync && (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t("api.dawarich.needsInterval")}</Text>
            )}
            {isGetMethod && !isInstantSync && (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t("api.dawarich.needsPost")}</Text>
            )}
          </>
        )}

        <SectionTitle
          action={
            hasModifications
              ? { label: t("api.resetAll"), onPress: handleResetAll, testID: "reset-all-fields-btn" }
              : undefined
          }
        >
          {t("api.fieldMappings")}
        </SectionTitle>

        {fieldKeys.map((key, index) => {
          const isFieldModified = modifiedFields.has(key)
          const fieldValue = localFieldMap[key]?.trim()
          const isDuplicate = fieldValue != null && duplicateFieldNames.has(fieldValue)
          return (
            <View key={key} style={index > 0 ? styles.field : undefined}>
              <TextField
                label={key}
                hint={t(FIELD_DESCRIPTION_KEYS[key])}
                error={isDuplicate ? t("api.duplicateField") : undefined}
                mono
                value={localFieldMap[key]}
                onChangeText={(value) => handleFieldChange(key, value)}
                placeholder={referenceFieldMap[key]}
                autoCapitalize="none"
                autoCorrect={false}
                trailing={
                  isFieldModified
                    ? {
                        icon: RotateCcw,
                        onPress: () => handleResetField(key),
                        accessibilityLabel: t("api.resetField", { field: key }),
                        testID: `reset-${key}-btn`
                      }
                    : undefined
                }
              />
            </View>
          )
        })}

        <SectionTitle>{t("api.customFields")}</SectionTitle>

        {localCustomFields.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t("api.customFields.empty")}</Text>
        ) : (
          localCustomFields.map((field, index) => {
            const isDuplicate = duplicateFieldNames.has(field.key.trim())
            return (
              <View key={field.id}>
                {index > 0 && <Divider tight />}
                <View style={styles.customFieldRow}>
                  <View style={styles.customFieldInputs}>
                    <TextField
                      label={t("api.customFields.key")}
                      error={isDuplicate ? t("api.duplicateField") : undefined}
                      mono
                      value={field.key}
                      onChangeText={(value) => handleCustomFieldChange(field.id, "key", value)}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextField
                      label={t("api.customFields.value")}
                      mono
                      value={field.value}
                      onChangeText={(value) => handleCustomFieldChange(field.id, "value", value)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      containerStyle={styles.customFieldValue}
                    />
                  </View>
                  <Pressable
                    testID={`remove-field-${field.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={t("api.customFields.remove", { name: field.key || t("api.customFields.key") })}
                    android_ripple={{ color: colors.error + STATE_LAYER_ALPHA, borderless: true, radius: 20 }}
                    onPress={() => handleRemoveCustomField(field.id)}
                    style={styles.removeButton}
                  >
                    <X size={size.icon.md} color={colors.error} />
                  </Pressable>
                </View>
              </View>
            )
          })
        )}

        <Button
          testID="add-field-btn"
          title={t("api.customFields.add")}
          variant="ghost"
          align="start"
          icon={Plus}
          onPress={handleAddCustomField}
          style={styles.addButton}
        />

        {duplicateFieldNames.size > 0 && (
          <View style={styles.notice}>
            <Notice
              testID="duplicate-fields-notice"
              variant="error"
              title={t("api.duplicates.title", { names: [...duplicateFieldNames].join(", ") })}
              message={t("api.duplicates.message")}
            />
          </View>
        )}

        <SectionTitle>{isGetMethod ? t("api.exampleRequest") : t("api.examplePayload")}</SectionTitle>
        <View style={[styles.payload, { backgroundColor: colors.well }]}>
          <Text style={[styles.payloadCode, { color: colors.textSecondary }]}>{examplePayload}</Text>
        </View>
        <Button
          testID="copy-payload-btn"
          title={copied ? t("api.copied") : t("api.copy")}
          variant="ghost"
          align="start"
          onPress={handleCopyPayload}
        />

        <Text style={[styles.footer, { color: colors.textLight }]}>{t("api.footer")}</Text>
      </ScrollView>

      <Toast saving={saving} success={saveSuccess} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  intro: {
    ...text.body
  },
  hint: {
    ...text.label,
    marginTop: space.sm
  },
  field: {
    marginTop: space.lg
  },
  customFieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingVertical: space.md
  },
  customFieldInputs: {
    flex: 1
  },
  customFieldValue: {
    marginTop: space.sm
  },
  removeButton: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  addButton: {
    marginTop: space.sm
  },
  notice: {
    marginTop: space.lg
  },
  payload: {
    borderRadius: radius.sm,
    padding: space.lg
  },
  payloadCode: {
    ...text.mono
  },
  footer: {
    ...text.caption,
    marginTop: space.xxl
  }
})
