#!/usr/bin/env bash
# Copyright (C) 2026 Max Dietrich
# Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
#
# Installs the pinned Hugo release into apps/docs/.bin, checked against its sha256.
set -euo pipefail

# Renovate bumps both lines together (customManagers in renovate.json); SHA256 is the linux-amd64 archive's.
VERSION="v0.168.0"
SHA256="fada83ad56bb27ed4cb7dd81590303bdac16140f944ac4e66fc248117e2d5594"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin="$here/../.bin"

if [[ -x "$bin/hugo" ]] && "$bin/hugo" version | grep -q "$VERSION-"; then
  exit 0
fi

if [[ "$(uname -s)-$(uname -m)" != "Linux-x86_64" ]]; then
  echo "No pinned Hugo for $(uname -s)-$(uname -m). Install Hugo $VERSION and copy it to $bin/hugo." >&2
  exit 1
fi

asset="hugo_${VERSION#v}_linux-amd64.tar.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/$asset" "https://github.com/gohugoio/hugo/releases/download/$VERSION/$asset"
echo "$SHA256  $tmp/$asset" | sha256sum -c --quiet -
tar -xzf "$tmp/$asset" -C "$tmp" hugo
mkdir -p "$bin"
mv "$tmp/hugo" "$bin/hugo"
"$bin/hugo" version
