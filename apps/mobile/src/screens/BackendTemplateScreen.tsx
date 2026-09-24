/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback } from "react"
import { View, ScrollView, StyleSheet } from "react-native"
import { Card, Container, RadioRow } from "../components"
import { API_TEMPLATES, ApiTemplateName } from "../types/global"
import { space } from "../constants"
import type { RootScreenProps } from "../types/navigation"
import { useTranslation } from "../i18n/useTranslation"
import type { TranslationKey } from "../i18n/options"

type TemplateOption = { value: ApiTemplateName; label: string | null; descriptionKey: TranslationKey }

/**
 * Eight options, each needing a sentence, is past the point where inline radio rows fit a form
 * screen: it measures around 580dp. Android puts that behind a row on the parent screen, the way
 * Settings does for Default browser or Digital assistant app.
 */
const OPTIONS: TemplateOption[] = [
  { value: "custom", label: null, descriptionKey: "template.custom.description" },
  ...Object.entries(API_TEMPLATES).map(([key, template]) => ({
    value: key as ApiTemplateName,
    label: template.label,
    descriptionKey: template.descriptionKey
  }))
]

export function BackendTemplateScreen({ navigation, route }: RootScreenProps<"Backend Template">) {
  const { t } = useTranslation()
  const selected = route.params.selected

  const choose = useCallback(
    (value: ApiTemplateName) => {
      navigation.popTo("Request Format", { template: value }, { merge: true })
    },
    [navigation]
  )

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card rows>
          <View accessibilityRole="radiogroup">
            {OPTIONS.map((option) => (
              <RadioRow
                key={option.value}
                testID={`template-${option.value}`}
                label={option.label ?? t("common.custom")}
                sub={t(option.descriptionKey)}
                selected={selected === option.value}
                onPress={() => choose(option.value)}
              />
            ))}
          </View>
        </Card>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  }
})
