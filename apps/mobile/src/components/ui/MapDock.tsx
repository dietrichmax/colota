/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { ScrollView, StyleSheet } from "react-native"
import { space } from "../../constants"
import { Card } from "./Card"

type MapDockProps = {
  maxHeight: number
  children: React.ReactNode
}

/** The card that docks over a map's bottom edge: rows on the elevated surface, scrolling once it hits its cap. */
export function MapDock({ maxHeight, children }: MapDockProps) {
  return (
    <Card variant="elevated" rows>
      <ScrollView
        style={[styles.scroll, { maxHeight }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Card>
  )
}

const styles = StyleSheet.create({
  // The ScrollView clips, so it spans the card and insets its content or a row's ripple stops at the padding.
  scroll: {
    marginHorizontal: -space.lg
  },
  scrollContent: {
    paddingHorizontal: space.lg
  }
})
