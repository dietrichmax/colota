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
export { IconButton } from "./ui/IconButton"
export { HeaderAction } from "./ui/HeaderAction"
export { SectionTitle } from "./ui/SectionTitle"
export { Divider } from "./ui/Divider"
export { EmptyState } from "./ui/EmptyState"
export { TextField } from "./ui/TextField"
export { NumericInput } from "./ui/NumericInput"
export { TimePicker } from "./ui/TimePicker"
export { FloatingSaveIndicator } from "./ui/FloatingSaveIndicator"
export { SpinningLoader } from "./ui/SpinningLoader"
export { LoadingOverlay } from "./ui/LoadingOverlay"
export { LocationDisclosureModal } from "./ui/LocationDisclosureModal"
export { LocalNetworkDisclosureModal } from "./ui/LocalNetworkDisclosureModal"
export { AppModal } from "./ui/AppModal"
export { DialogShell } from "./ui/DialogShell"
export { ChipGroup } from "./ui/ChipGroup"
export { ExportFormatDialog } from "./ui/ExportFormatDialog"
export { RadioDot } from "./ui/RadioDot"
export { RadioRow } from "./ui/RadioRow"
export { SettingRow } from "./ui/SettingRow"
export { Toggle } from "./ui/Toggle"
export { FieldMessage } from "./ui/FieldMessage"
export { ListItem } from "./ui/ListItem"
export { StateLine } from "./ui/StateLine"
export { MapDock } from "./ui/MapDock"
export { TrackMark } from "./ui/TrackMark"
export { StepperHeader } from "./ui/StepperHeader"
export { BottomTabBar, TAB_ROUTES } from "./ui/BottomTabBar"

// ============================================================================
// Feature Components - Dashboard
// ============================================================================
export { DashboardMap } from "./features/dashboard/DashboardMap"
export { ConnectionStatus } from "./features/dashboard/ConnectionStatus"
export { WelcomeCard } from "./features/dashboard/WelcomeCard"

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
export { ConnectionSettings } from "./features/settings/ConnectionSettings"
export { SyncStrategySettings } from "./features/settings/SyncStrategySettings"
export { StatRow } from "./ui/StatRow"
export { Footer } from "./ui/Footer"
export { DashboardBanner } from "./features/dashboard/DashboardBanner"
export { DashboardDock } from "./features/dashboard/DashboardDock"
export { DayHeader } from "./features/inspector/DayHeader"
export { DayPickerModal } from "./features/inspector/DayPickerModal"
export { TripRow } from "./features/inspector/TripRow"
export { InspectorDock } from "./features/inspector/InspectorDock"
export { PointCard } from "./features/inspector/PointCard"
export { StatsCard } from "./features/settings/StatsCard"
