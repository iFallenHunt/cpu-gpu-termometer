#!/bin/bash
# Termo Linux - GNOME Extension Installer
# Copies extension to user directory, enables it, and prompts for shell restart

set -e

EXT_UUID="termo-linux@local"
EXT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions"

echo "Installing Termo Linux extension..."

mkdir -p "$TARGET_DIR"
cp -r "$EXT_DIR/$EXT_UUID" "$TARGET_DIR/"

echo "Extension copied. Enabling..."
gnome-extensions enable "$EXT_UUID"

echo ""
echo "Installation complete!"
echo ""
echo "Restart GNOME Shell to apply changes:"
echo "  - X11:  Press Alt+F2, type 'r', press Enter"
echo "  - Wayland: Log out and log back in"
echo ""
