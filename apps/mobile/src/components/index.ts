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
export { TimePicker } from "./ui/TimePicker"
export { FloatingSaveIndicator } from "./ui/FloatingSaveIndicator"
export { Footer } from "./ui/Footer"
export { SpinningLoader } from "./ui/SpinningLoader"
export { LocationDisclosureModal } from "./ui/LocationDisclosureModal"
export { LocalNetworkDisclosureModal } from "./ui/LocalNetworkDisclosureModal"
export { AppModal } from "./ui/AppModal"
export { ChipGroup } from "./ui/ChipGroup"
export { FormatOption } from "./ui/FormatOption"
export { FormatSelector } from "./ui/FormatSelector"
export { RadioDot } from "./ui/RadioDot"
export { SettingRow } from "./ui/SettingRow"
export { FieldMessage } from "./ui/FieldMessage"
export { ListItem } from "./ui/ListItem"
export { BottomTabBar } from "./ui/BottomTabBar"

// ============================================================================
// Feature Components - Dashboard
// ============================================================================
export { DashboardMap } from "./features/dashboard/DashboardMap"
export { CoordinateDisplay } from "./features/dashboard/CoordinateDisplay"
export { ConnectionStatus } from "./features/dashboard/ConnectionStatus"
export { WelcomeCard } from "./features/dashboard/WelcomeCard"
export { DatabaseStatistics } from "./features/dashboard/DatabaseStatistics"

// ============================================================================
// Feature Components - Map
// ============================================================================
export { MapCenterButton } from "./features/map/MapCenterButton"

// ============================================================================
// Feature Components - Inspector
// ============================================================================
export { TrackMap } from "./features/inspector/TrackMap"

// ============================================================================
// Feature Components - Settings
// ============================================================================
export { StatsCard } from "./features/settings/StatsCard"
export { ConnectionSettings } from "./features/settings/ConnectionSettings"
export { SyncStrategySettings } from "./features/settings/SyncStrategySettings"
