#!/usr/bin/env python3
"""
bump-version.py - Update the version across the entire Colota monorepo.

Usage:
    python scripts/bump-version.py <version>

Example:
    python scripts/bump-version.py 1.1.0

The script updates:
    - package.json (root)
    - apps/mobile/package.json
    - apps/docs/package.json
    - packages/shared/package.json
    - apps/mobile/android/app/build.gradle (versionName + auto-incremented versionCode)

It does NOT create any git commits or tags.
"""

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

PACKAGE_FILES = [
    REPO_ROOT / "package.json",
    REPO_ROOT / "apps" / "mobile" / "package.json",
    REPO_ROOT / "apps" / "docs" / "package.json",
    REPO_ROOT / "packages" / "shared" / "package.json",
]

BUILD_GRADLE = REPO_ROOT / "apps" / "mobile" / "android" / "app" / "build.gradle"


def update_package_json(file: Path, version: str):
    if not file.is_file():
        print(f"  Warning: {file} not found - skipping.")
        return

    text = file.read_text(encoding="utf-8")
    pkg = json.loads(text)
    old_version = pkg.get("version", "(none)")

    pkg["version"] = version

    # Detect indent from original file
    indent_match = re.search(r"^([ \t]+)", text, re.MULTILINE)
    indent = indent_match.group(1) if indent_match else "  "
    indent_size = len(indent)

    file.write_text(json.dumps(pkg, indent=indent_size, ensure_ascii=False) + "\n", encoding="utf-8")

    display = file.relative_to(REPO_ROOT)
    print(f"  {display}: {old_version} -> {version}")


def update_build_gradle(file: Path, version: str):
    if not file.is_file():
        print(f"  Warning: {file} not found - skipping.")
        return

    text = file.read_text(encoding="utf-8")

    # Read current values
    name_match = re.search(r'versionName "(.+?)"', text)
    code_match = re.search(r"versionCode (\d+)", text)

    old_name = name_match.group(1) if name_match else "(unknown)"
    old_code = int(code_match.group(1)) if code_match else 0
    new_code = old_code + 1

    # Update
    text = re.sub(r'versionName ".+?"', f'versionName "{version}"', text)
    text = re.sub(r"versionCode \d+", f"versionCode {new_code}", text)

    file.write_text(text, encoding="utf-8")

    display = file.relative_to(REPO_ROOT)
    print(f"  {display}:")
    print(f'    versionName: "{old_name}" -> "{version}"')
    print(f"    versionCode: {old_code} -> {new_code}")


def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/bump-version.py <version>")
        print("  version must be in semver format: x.y.z (e.g. 1.2.3)")
        sys.exit(1)

    version = sys.argv[1]

    if not re.match(r"^\d+\.\d+\.\d+$", version):
        print(f"Error: Invalid version format '{version}'.")
        print("  Expected semver format: x.y.z (e.g. 1.2.3)")
        sys.exit(1)

    print()
    print(f"Bumping version to {version}")
    print("================================")
    print()

    print("Updating package.json files:")
    for file in PACKAGE_FILES:
        update_package_json(file, version)
    print()

    print("Updating build.gradle:")
    update_build_gradle(BUILD_GRADLE, version)
    print()

    print("================================")
    print(f"Done. Version bumped to {version}.")
    print("No git commits or tags were created.")
    print()


if __name__ == "__main__":
    main()
