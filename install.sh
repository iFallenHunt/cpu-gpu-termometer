#!/bin/bash
# CPU GPU Temp - GNOME Extension Installer
# Copies extension to user directory. Enable AFTER restarting GNOME Shell.

set -e

EXT_UUID="cpu-gpu-temp"
EXT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions"

echo "Installing CPU GPU Temp extension..."

mkdir -p "$TARGET_DIR"
cp -r "$EXT_DIR/$EXT_UUID" "$TARGET_DIR/"

echo ""
echo "Installation complete!"
echo ""
echo "IMPORTANT - Next steps:"
echo "  1. Restart GNOME Shell:"
echo "     - X11:   Alt+F2, type 'r', press Enter"
echo "     - Wayland: Log out and log back in"
echo ""
echo "  2. After restart, enable the extension:"
echo "     - Open 'Extensions' app and toggle 'CPU GPU Temp' ON"
echo "     - Or run: gnome-extensions enable $EXT_UUID"
echo ""
