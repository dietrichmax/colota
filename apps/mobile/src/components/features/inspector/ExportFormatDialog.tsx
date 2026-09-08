/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { Upload } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { space } from "../../../constants"
import { fonts, fontSizes, lineHeights } from "../../../styles/typography"
import { EXPORT_FORMAT_KEYS, EXPORT_FORMATS, type ExportFormat } from "../../../utils/exportConverters"
import { Button } from "../../ui/Button"
import { DialogShell } from "../../ui/DialogShell"
import { Divider } from "../../ui/Divider"
import { ListItem } from "../../ui/ListItem"

type ExportFormatDialogProps = {
  visible: boolean
  title: string
  message: string
  onSelect: (format: ExportFormat) => void
  onRequestClose: () => void
}

export function ExportFormatDialog({ visible, title, message, onSelect, onRequestClose }: ExportFormatDialogProps) {
  const { colors } = useTheme()

  return (
    <DialogShell
      visible={visible}
      title={title}
      onRequestClose={onRequestClose}
      footer={<Button variant="ghost" title="Cancel" onPress={onRequestClose} testID="export-cancel" />}
    >
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      <View style={styles.rows}>
        {EXPORT_FORMAT_KEYS.map((key, i) => (
          <React.Fragment key={key}>
            {i > 0 && <Divider tight />}
            <ListItem
              label={EXPORT_FORMATS[key].label}
              sub={EXPORT_FORMATS[key].description}
              trailingIcon={Upload}
              onPress={() => onSelect(key)}
              testID={`export-${key}`}
            />
          </React.Fragment>
        ))}
      </View>
    </DialogShell>
  )
}

const styles = StyleSheet.create({
  message: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    ...fonts.regular,
    marginBottom: space.sm
  },
  // A row cancels a card's lg inset; the dialog pads xl, so the rows step out the remaining sm to reach its edge.
  rows: {
    marginHorizontal: -space.sm
  }
})
