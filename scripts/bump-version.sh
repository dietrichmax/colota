#!/usr/bin/env bash
#
# bump-version.sh — Update the version across the entire Colota monorepo.
#
# Usage:
#   ./scripts/bump-version.sh <version>
#
# Example:
#   ./scripts/bump-version.sh 1.1.0
#
# The script updates:
#   - package.json (root)
#   - apps/mobile/package.json
#   - apps/docs/package.json
#   - packages/shared/package.json
#   - apps/mobile/android/app/build.gradle (versionName + auto-incremented versionCode)
#
# It does NOT create any git commits or tags.

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve the repository root (parent of the scripts/ directory)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Validate arguments
# ---------------------------------------------------------------------------
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>"
  echo "  version must be in semver format: x.y.z (e.g. 1.2.3)"
  exit 1
fi

NEW_VERSION="$1"

# Validate semver format (major.minor.patch, all non-negative integers)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Invalid version format '$NEW_VERSION'."
  echo "  Expected semver format: x.y.z (e.g. 1.2.3)"
  exit 1
fi

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT_PKG="$REPO_ROOT/package.json"
MOBILE_PKG="$REPO_ROOT/apps/mobile/package.json"
DOCS_PKG="$REPO_ROOT/apps/docs/package.json"
SHARED_PKG="$REPO_ROOT/packages/shared/package.json"
BUILD_GRADLE="$REPO_ROOT/apps/mobile/android/app/build.gradle"

# ---------------------------------------------------------------------------
# Helper: convert a path to a form that Node.js can use on any OS.
# On Windows (MSYS2/Git Bash) paths like /c/Users/... must become C:/Users/...
# ---------------------------------------------------------------------------
to_node_path() {
  local p="$1"
  # Detect MSYS/Git-Bash style /c/ prefix and convert to C:/
  if [[ "$p" =~ ^/([a-zA-Z])/ ]]; then
    p="${BASH_REMATCH[1]^}:/${p:3}"
  fi
  echo "$p"
}

# ---------------------------------------------------------------------------
# Helper: update "version" in a package.json using node (handles JSON safely)
# ---------------------------------------------------------------------------
update_package_json() {
  local file="$1"
  local version="$2"

  if [[ ! -f "$file" ]]; then
    echo "  Warning: $file not found — skipping."
    return
  fi

  local node_file
  node_file=$(to_node_path "$file")

  # Read old version (may be absent)
  local old_version
  old_version=$(node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$node_file', 'utf8'));
    console.log(pkg.version || '(none)');
  " 2>/dev/null) || old_version="(unknown)"

  # Write new version — use a small Node script to preserve formatting
  node -e "
    const fs = require('fs');
    const raw = fs.readFileSync('$node_file', 'utf8');
    const pkg = JSON.parse(raw);
    pkg.version = '$version';
    // Detect indent (default 2 spaces)
    const indent = (raw.match(/^[ \t]+/m) || ['  '])[0];
    fs.writeFileSync('$node_file', JSON.stringify(pkg, null, indent) + '\n');
  "

  # Display a relative-ish path for readability
  local display_path="${file#$REPO_ROOT/}"
  echo "  $display_path: $old_version -> $version"
}

# ---------------------------------------------------------------------------
# Helper: update versionName and versionCode in build.gradle
# ---------------------------------------------------------------------------
update_build_gradle() {
  local file="$1"
  local version="$2"

  if [[ ! -f "$file" ]]; then
    echo "  Warning: $file not found — skipping."
    return
  fi

  # Read current versionName
  local old_version_name
  old_version_name=$(sed -n 's/.*versionName "\(.*\)"/\1/p' "$file" | head -1)

  # Read current versionCode
  local old_version_code
  old_version_code=$(sed -n 's/.*versionCode \([0-9]*\)/\1/p' "$file" | head -1)

  # Compute new versionCode
  local new_version_code=$(( old_version_code + 1 ))

  # Update versionName
  sed -i "s/versionName \"$old_version_name\"/versionName \"$version\"/" "$file"

  # Update versionCode
  sed -i "s/versionCode $old_version_code/versionCode $new_version_code/" "$file"

  local display_path="${file#$REPO_ROOT/}"
  echo "  $display_path:"
  echo "    versionName: \"$old_version_name\" -> \"$version\""
  echo "    versionCode: $old_version_code -> $new_version_code"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo ""
echo "Bumping version to $NEW_VERSION"
echo "================================"
echo ""

echo "Updating package.json files:"
update_package_json "$ROOT_PKG"    "$NEW_VERSION"
update_package_json "$MOBILE_PKG"  "$NEW_VERSION"
update_package_json "$DOCS_PKG"    "$NEW_VERSION"
update_package_json "$SHARED_PKG"  "$NEW_VERSION"
echo ""

echo "Updating build.gradle:"
update_build_gradle "$BUILD_GRADLE" "$NEW_VERSION"
echo ""

echo "================================"
echo "Done. Version bumped to $NEW_VERSION."
echo "No git commits or tags were created."
echo ""
