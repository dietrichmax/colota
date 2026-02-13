/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

/**
 * Component Exports
 *
 * Organized by category for better maintainability and discoverability.
 * Uses named exports for better tree-shaking and IDE autocomplete.
 */

// ============================================================================
// UI Components (Core)
// ============================================================================
export { Container } from "./ui/Container"
export { Card } from "./ui/Card"
export { Button } from "./ui/Button"
export { SectionTitle } from "./ui/SectionTitle"
export { Divider } from "./ui/Divider"
export { NumericInput } from "./ui/NumericInput"
export { FloatingSaveIndicator } from "./ui/FloatingSaveIndicator"
export { Footer } from "./ui/Footer"

// ============================================================================
// Feature Components - Dashboard
// ============================================================================
export { DashboardMap } from "./features/dashboard/DashboardMap"
export { CoordinateDisplay } from "./features/dashboard/CoordinateDisplay"
export { ComingSoonRibbon } from "./features/dashboard/ComingSoonRibbon"
export { QuickAccess } from "./features/dashboard/QuickAccess"

// ============================================================================
// Feature Components - Map
// ============================================================================
export { MapCenterButton } from "./features/map/MapCenterButton"

// ============================================================================
// Feature Components - Database
// ============================================================================
export { DatabaseStatistics } from "./features/databases/DatabaseStatistics"

// ============================================================================
// Feature Components - Settings
// ============================================================================
export { ServerConnection } from "./features/settings/ServerConnection"
export { StatsCard } from "./features/settings/StatsCard"
export { PresetOption } from "./features/settings/PresetOption"
