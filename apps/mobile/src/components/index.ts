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
export { SpinningLoader } from "./ui/SpinningLoader"
export { LocationDisclosureModal } from "./ui/LocationDisclosureModal"
export { AppModal } from "./ui/AppModal"
export { ChipGroup } from "./ui/ChipGroup"

// ============================================================================
// Feature Components - Dashboard
// ============================================================================
export { DashboardMap } from "./features/dashboard/DashboardMap"
export { CoordinateDisplay } from "./features/dashboard/CoordinateDisplay"
export { QuickAccess } from "./features/dashboard/QuickAccess"
export { ServerConnection } from "./features/dashboard/ServerConnection"
export { WelcomeCard } from "./features/dashboard/WelcomeCard"
export { DatabaseStatistics } from "./features/dashboard/DatabaseStatistics"

// ============================================================================
// Feature Components - Map
// ============================================================================
export { MapCenterButton } from "./features/map/MapCenterButton"

// ============================================================================
// Feature Components - Inspector
// ============================================================================
export { DatePicker } from "./features/inspector/DatePicker"
export { TrackMap } from "./features/inspector/TrackMap"

// ============================================================================
// Feature Components - Settings
// ============================================================================
export { StatsCard } from "./features/settings/StatsCard"
export { ConnectionSettings } from "./features/settings/ConnectionSettings"
export { SyncStrategySettings } from "./features/settings/SyncStrategySettings"
