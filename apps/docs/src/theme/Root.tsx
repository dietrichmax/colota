/**
 * Docusaurus Root wrapper - injects CSS custom properties from @colota/shared.
 * This makes packages/shared/src/colors.ts the single source of truth
 * for both the mobile app and the docs site.
 */

import React from "react"
import { lightColors, darkColors, fontFamily } from "@colota/shared"
import type { ThemeColors } from "@colota/shared"

function colorVars(colors: ThemeColors) {
  return `
    --ifm-color-primary: ${colors.primary};
    --ifm-color-primary-dark: ${colors.primaryDark};
    --ifm-color-primary-darker: ${colors.primaryDark};
    --ifm-color-primary-darkest: ${colors.primaryDark};
    --ifm-color-primary-light: ${colors.primaryLight};
    --ifm-color-primary-lighter: ${colors.primaryLight};
    --ifm-color-primary-lightest: ${colors.primaryLight};
    --ifm-background-color: ${colors.background};
    --ifm-font-color-base: ${colors.text};
    --ifm-font-color-secondary: ${colors.textSecondary};
    --ifm-link-color: ${colors.link};
    --ifm-font-family-base: '${fontFamily}', system-ui, -apple-system, sans-serif;
    --colota-card-bg: ${colors.card};
    --colota-card-elevated-bg: ${colors.cardElevated};
    --colota-border: ${colors.border};
    --colota-card-radius: 12px;
    --colota-card-padding: 16px;
  `
}

const themeStyles = `
  :root { ${colorVars(lightColors)} }
  [data-theme='dark'] { ${colorVars(darkColors)} }
  .hero--primary {
    background: linear-gradient(135deg, ${lightColors.primary} 0%, ${lightColors.primaryDark} 100%);
  }
  [data-theme='dark'] .hero--primary {
    background: linear-gradient(135deg, ${darkColors.primaryDark} 0%, ${darkColors.background} 100%);
  }
`

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeStyles }} />
      {children}
    </>
  )
}
