/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

export { lightColors, darkColors, STATE_LAYER_ALPHA } from "./colors"
export type { ThemeColors, ThemeMode } from "./colors"
export { fontFamily, fontSizes } from "./typography"
export { radius } from "./radius"
export type { RadiusName } from "./radius"
export { space } from "./space"
export { size } from "./size"
export {
  REPO_URL,
  ISSUES_URL,
  DISCUSSIONS_URL,
  GITHUB_RELEASES_URL,
  PRIVACY_POLICY_URL,
  RELEASES_URL,
  SUPPORT_URL,
  PLAY_STORE_WEB_URL,
  FDROID_URL,
  IZZYONDROID_URL
} from "./links"
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
