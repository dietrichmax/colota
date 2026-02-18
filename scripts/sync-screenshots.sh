#!/usr/bin/env bash
#
# sync-screenshots.sh — Sync screenshots from the single source of truth
# to the docs site and Fastlane (F-Droid + Play Store) metadata.
#
# Usage:
#   ./scripts/sync-screenshots.sh
#
# Source:      screenshots/mobile/original/
# Targets:
#   - apps/docs/static/img/screenshots/          (named, for docs site)
#   - apps/mobile/android/app/fastlane/metadata/  (numbered, for stores)

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve the repository root (parent of the scripts/ directory)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SRC="$REPO_ROOT/screenshots/mobile/original"
DOCS="$REPO_ROOT/apps/docs/static/img/screenshots"
STORE="$REPO_ROOT/apps/mobile/android/app/fastlane/metadata/android/en-US/images/phoneScreenshots"

# Ordered mapping: source filename → store number
STORE_ORDER=(
  "Dashboard.png"
  "Settings.png"
  "Authentication.png"
  "DataManagement.png"
  "ApiFieldMapping.png"
  "ProfileEditor.png"
  "Geofences.png"
  "LocationInspector.png"
  "ExportData.png"
  "DarkMode.png"
)

# ---------------------------------------------------------------------------
# Validate source directory
# ---------------------------------------------------------------------------
if [[ ! -d "$SRC" ]]; then
  echo "Error: Source directory not found: $SRC"
  exit 1
fi

# ---------------------------------------------------------------------------
# Sync to docs (named copies)
# ---------------------------------------------------------------------------
echo ""
echo "Syncing screenshots"
echo "================================"
echo ""

mkdir -p "$DOCS"

echo "Docs (named):"
for file in "$SRC"/*.png; do
  name="$(basename "$file")"
  cp "$file" "$DOCS/$name"
  echo "  $name -> docs"
done

# ---------------------------------------------------------------------------
# Sync to Fastlane store metadata (numbered copies)
# ---------------------------------------------------------------------------
echo ""
mkdir -p "$STORE"

echo "Fastlane (numbered):"
i=1
for name in "${STORE_ORDER[@]}"; do
  src_file="$SRC/$name"
  if [[ ! -f "$src_file" ]]; then
    echo "  Warning: $name not found in source — skipping."
    continue
  fi
  cp "$src_file" "$STORE/$i.png"
  echo "  $name -> $i.png"
  i=$((i + 1))
done

echo ""
echo "================================"
echo "Done. $(( i - 1 )) screenshots synced."
echo ""
