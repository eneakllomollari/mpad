#!/bin/bash
set -e

REPO="eneakllomollari/mpad"
APP_NAME="mpad"
INSTALL_DIR="/Applications"

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
    arm64|aarch64)
        TARGET="aarch64"
        ;;
    x86_64|amd64)
        TARGET="x86_64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "Installing mpad for $TARGET..."

# Download
TMP_DIR=$(mktemp -d)
ZIP_FILE="$TMP_DIR/mpad.zip"

URL="https://github.com/$REPO/releases/download/latest/mpad-$TARGET.zip"
echo "Downloading from $URL..."
curl -fSL "$URL" -o "$ZIP_FILE"

# Extract
echo "Extracting to $INSTALL_DIR..."
unzip -o "$ZIP_FILE" -d "$INSTALL_DIR"

# Remove quarantine attributes (macOS)
if command -v xattr &> /dev/null; then
    xattr -cr "$INSTALL_DIR/$APP_NAME.app" 2>/dev/null || true
fi

# Install CLI wrapper
CLI_TARGET="/usr/local/bin/$APP_NAME"
if [ -d "/usr/local/bin" ]; then
    echo "Installing CLI wrapper to $CLI_TARGET..."
    CLI_SCRIPT="$TMP_DIR/mpad-cli"
    curl -fsSL "https://raw.githubusercontent.com/$REPO/main/scripts/mpad" -o "$CLI_SCRIPT"
    chmod +x "$CLI_SCRIPT"
    # Remove any existing target first. If it's a symlink (e.g. from an older
    # install), `cp` would follow it and either fail with ENOENT or clobber the
    # link's target — including the app binary it may point at.
    rm -f "$CLI_TARGET"
    cp "$CLI_SCRIPT" "$CLI_TARGET"
else
    echo "Warning: /usr/local/bin not found. CLI wrapper not installed."
fi

# Cleanup
rm -rf "$TMP_DIR"

echo "✓ mpad installed to $INSTALL_DIR/$APP_NAME.app"
echo "✓ CLI wrapper installed to $CLI_TARGET"
echo ""
echo "Run 'mpad help' for usage, 'mpad update' to update."
