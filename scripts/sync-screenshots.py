#!/usr/bin/env python3
"""
sync-screenshots.py - Sync screenshots from the single source of truth
to the docs site and Fastlane (F-Droid + Play Store) metadata.

Usage:
    python scripts/sync-screenshots.py

Source:      screenshots/mobile/original/
Targets:
    - apps/docs/static/img/screenshots/          (named, for docs site)
    - apps/mobile/android/app/fastlane/metadata/  (numbered, for stores)
"""

import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SRC = REPO_ROOT / "screenshots" / "mobile" / "original"
DOCS = REPO_ROOT / "apps" / "docs" / "static" / "img" / "screenshots"
STORE = REPO_ROOT / "apps" / "mobile" / "android" / "app" / "fastlane" / "metadata" / "android" / "en-US" / "images" / "phoneScreenshots"

STORE_ORDER = [
    "Dashboard.png",
    "Settings.png",
    "Authentication.png",
    "TrackingProfiles.png",
    "DataManagement.png",
    "ApiFieldMapping.png",
    "ExportData.png",
    "DarkMode.png",
]

def main():
    if not SRC.is_dir():
        print(f"Error: Source directory not found: {SRC}")
        sys.exit(1)

    print()
    print("Syncing screenshots")
    print("================================")
    print()

    # Sync to docs (named copies)
    DOCS.mkdir(parents=True, exist_ok=True)

    print("Docs (named):")
    for file in sorted(SRC.glob("*.png")):
        shutil.copy2(file, DOCS / file.name)
        print(f"  {file.name} -> docs")

    # Sync to Fastlane store metadata (numbered copies)
    print()
    STORE.mkdir(parents=True, exist_ok=True)

    print("Fastlane (numbered):")
    count = 0
    for i, name in enumerate(STORE_ORDER, start=1):
        src_file = SRC / name
        if not src_file.is_file():
            print(f"  Warning: {name} not found in source - skipping.")
            continue
        shutil.copy2(src_file, STORE / f"{i}.png")
        print(f"  {name} -> {i}.png")
        count += 1

    print()
    print("================================")
    print(f"Done. {count} screenshots synced.")
    print()

if __name__ == "__main__":
    main()
