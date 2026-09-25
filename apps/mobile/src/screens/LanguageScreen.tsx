/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { ScreenProps } from "../types/global"
import { Card, Container, RadioRow } from "../components"
import { useTranslation } from "../i18n/useTranslation"
import { t as translate } from "../i18n/t"
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "../i18n/options"
import { setLanguageChoice, type LanguageChoice } from "../i18n/language"
import { useLanguageChoice } from "../hooks/useLanguageChoice"
import { showAlert } from "../services/modalService"
import { logger } from "../utils/logger"
import { space } from "../constants"

export function LanguageScreen({}: ScreenProps) {
  const { t } = useTranslation()
  const [choice, setChoice] = useLanguageChoice()
  const busy = useRef(false)

  const choose = async (next: LanguageChoice) => {
    if (busy.current || choice === null || next === choice) return
    const previous = choice
    busy.current = true
    setChoice(next)
    try {
      await setLanguageChoice(next)
    } catch (err) {
      logger.error("[LanguageScreen] Failed to change the language:", err)
      setChoice(previous)
      showAlert(translate("common.error"), translate("language.changeFailed"), "error")
    } finally {
      busy.current = false
    }
  }

  const options: { value: LanguageChoice; label: string }[] = [
    { value: "system", label: t("language.system") },
    ...SUPPORTED_LANGUAGES.map((lang) => ({ value: lang, label: LANGUAGE_NAMES[lang] }))
  ]

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Card rows>
          <View accessibilityRole="radiogroup">
            {options.map(({ value, label }) => (
              <RadioRow
                key={value}
                testID={`language-${value}`}
                label={label}
                selected={choice === value}
                disabled={choice === null}
                onPress={() => choose(value)}
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
