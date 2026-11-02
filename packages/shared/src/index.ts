/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

export { lightColors, darkColors } from "./colors"
export type { ThemeColors, ThemeMode } from "./colors"
export { fontFamily, fontSizes } from "./typography"
export { radius } from "./radius"
export type { RadiusName } from "./radius"
export {
  API_TEMPLATE_NAMES,
  HTTP_METHODS,
  DAWARICH_MODES,
  ACCURACY_MODES,
  SYNC_CONDITIONS,
  AUTH_TYPES,
  PROFILE_CONDITION_TYPES,
  OVERLAND_BATCH_MIN,
  OVERLAND_BATCH_MAX,
  buildSetupLinkFromConfig,
  decodeConfig
} from "./setupSchema"
export type {
  ApiTemplateName,
  HttpMethod,
  DawarichMode,
  AccuracyMode,
  SyncCondition,
  AuthType,
  ProfileConditionType
} from "./setupSchema"
