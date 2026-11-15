#!/usr/bin/env bash
# Copyright (C) 2026 Max Dietrich
# Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
#
# Installs the pinned Pagefind release into apps/docs/.bin, checked against its sha256.
set -euo pipefail

# Renovate bumps both lines together (customManagers in renovate.json); SHA256 is the x86_64 linux archive's.
VERSION="v1.6.0"
SHA256="004d40c9a644c995dadc42b8031196c6f17e7a6dacf9a6c15c63286dd6ead5f2"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin="$here/../.bin"

if [[ -x "$bin/pagefind" ]] && [[ "$("$bin/pagefind" --version)" == "pagefind ${VERSION#v}" ]]; then
  exit 0
fi

if [[ "$(uname -s)-$(uname -m)" != "Linux-x86_64" ]]; then
  echo "No pinned Pagefind for $(uname -s)-$(uname -m). Install Pagefind $VERSION and copy it to $bin/pagefind." >&2
  exit 1
fi

asset="pagefind-$VERSION-x86_64-unknown-linux-musl.tar.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/$asset" "https://github.com/CloudCannon/pagefind/releases/download/$VERSION/$asset"
echo "$SHA256  $tmp/$asset" | sha256sum -c --quiet -
tar -xzf "$tmp/$asset" -C "$tmp" pagefind
mkdir -p "$bin"
mv "$tmp/pagefind" "$bin/pagefind"
"$bin/pagefind" --version
