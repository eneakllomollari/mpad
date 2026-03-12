#!/bin/bash
set -euo pipefail

REPO="eneakllomollari/mpad"
ARCH=$(uname -m)

case "$ARCH" in
  arm64) ARTIFACT="mpad-aarch64.zip" ;;
  x86_64) ARTIFACT="mpad-x86_64.zip" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

echo "Downloading mpad ($ARCH)..."
gh release download latest -R "$REPO" -p "$ARTIFACT" -D /tmp --clobber

echo "Installing to /Applications..."
unzip -o "/tmp/$ARTIFACT" -d /Applications
xattr -cr /Applications/mpad.app
rm "/tmp/$ARTIFACT"

echo "Done. Run: open /Applications/mpad.app"
