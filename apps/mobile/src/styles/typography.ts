/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 *
 * Re-exports typography from @colota/shared — the single source of truth.
 * Platform-specific font variants (Regular, Medium, etc.) are derived here.
 */

import { TextStyle } from "react-native"
import { fontFamily, fontSizes } from "@colota/shared"

export { fontSizes }

/**
 * Keys are `fontSizes` names, minus the seven sizes that set no line height and run on the platform
 * default. `mono` is the exception: it sits at caption size and takes more leading.
 */
export const lineHeights = {
  body: 20,
  description: 18,
  caption: 16,
  small: 16,
  mono: 18
} as const

export const fonts: Record<string, Pick<TextStyle, "fontFamily">> = {
  regular: { fontFamily: `${fontFamily}-Regular` },
  medium: { fontFamily: `${fontFamily}-Medium` },
  semiBold: { fontFamily: `${fontFamily}-SemiBold` },
  bold: { fontFamily: `${fontFamily}-Bold` }
}

/**
 * A role is a size and everything that always travels with it, so a caller names the job rather
 * than composing one. Only the sizes that are used at a single weight across the app are roles:
 * `body`, `description` and `caption` are each used at three or four weights, so a role for them
 * would pick a weight for call sites that disagree. Those keep composing `fontSizes` by hand.
 */
export const type = {
  /** The one screen-owning number or title, as on About and the error boundary. */
  display: { fontSize: fontSizes.screenTitle, ...fonts.bold },
  /** A stat's value. Tabular so the digits do not jitter as it counts. */
  figure: { fontSize: fontSizes.statValue, ...fonts.bold, fontVariant: ["tabular-nums"] },
  /** A card or dialog title. */
  title: { fontSize: fontSizes.cardTitle, ...fonts.bold },
  /** A heading inside a screen, above a block rather than a group of rows. */
  heading: { fontSize: fontSizes.heading, ...fonts.bold },
  /** A block of code, a log line or a payload: the platform monospace, never Inter. */
  mono: { fontSize: fontSizes.caption, fontFamily: "monospace", lineHeight: lineHeights.mono }
} as const satisfies Record<string, TextStyle>
