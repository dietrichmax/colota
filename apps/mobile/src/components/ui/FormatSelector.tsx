/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View } from "react-native"
import { ExportFormat, EXPORT_FORMATS } from "../../utils/exportConverters"
import { Divider } from "./Divider"
import { FormatOption } from "./FormatOption"

export const FormatSelector = ({
  selectedFormat,
  onSelectFormat
}: {
  selectedFormat: ExportFormat | null
  onSelectFormat: (format: ExportFormat) => void
}) => (
  <View accessibilityRole="radiogroup">
    {(Object.entries(EXPORT_FORMATS) as [ExportFormat, (typeof EXPORT_FORMATS)[ExportFormat]][]).map(
      ([key, config], index) => (
        <React.Fragment key={key}>
          {index > 0 && <Divider />}
          <FormatOption
            icon={config.icon}
            title={config.label}
            subtitle={config.subtitle}
            description={config.description}
            extension={config.extension}
            selected={selectedFormat === key}
            onPress={() => onSelectFormat(key)}
          />
        </React.Fragment>
      )
    )}
  </View>
)
