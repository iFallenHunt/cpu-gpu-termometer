# CPU GPU Temp - GNOME Extension

GNOME Shell extension that displays CPU and GPU temperature in the top panel of GNOME/Pop!_OS.

## Screenshot

<img width="206" height="40" alt="image" src="https://github.com/user-attachments/assets/09bb598e-338f-4c72-bb7e-f084e59ddc9b" />


## Features

- **Real-time monitoring** — CPU and GPU temperatures update every 2 seconds
- **Visual indicators** — Color-coded dots show temperature status at a glance:
  - **Green** (below 45°C) — Cool
  - **Orange** (46°C–59°C) — Warm
  - **Red** (60°C and above) — Hot
- **Compact layout** — Displays as `CPU: XX°C  GPU: XX°C` in the status area
- **No external dependencies** — Reads directly from Linux sysfs (thermal zones, hwmon)

## Supported Hardware

| Component | Supported | Notes |
|-----------|-----------|-------|
| CPU AMD   | ✓         | Via k10temp (thermal zones or hwmon) |
| CPU Intel | ✓         | Via coretemp (hwmon) |
| GPU AMD   | ✓         | Via hwmon/DRM |
| GPU Intel | ✓         | Integrated graphics via hwmon/DRM |
| GPU NVIDIA| ✓         | Via hwmon (nvidia or nouveau driver) |

## Compatible GNOME Versions

GNOME Shell 42, 43, 44, 45, 46, 47, 48 and 49.
