---
sidebar_position: 2
---

# Tracking Profiles

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

Tracking profiles automatically adjust GPS interval, distance filter, and sync settings when conditions like charging, car mode, or speed thresholds are met.

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/TrackingProfiles.png", label: "Tracking Profiles" }, ]} />

## Use Cases

- **Charging** - Increase tracking frequency while plugged in (battery isn't a concern)
- **Driving** - Switch to frequent updates when Android Auto connects or speed exceeds a threshold
- **Walking** - Use longer intervals at low speeds to conserve battery
- **Stationary** - Record a periodic heartbeat point (e.g. every 30 min) as proof-of-presence while not moving

## Setup

1. Go to **Settings** → **Tracking Profiles**
2. Tap **Create Profile**
3. Enter a name and select a condition trigger
4. Configure the GPS interval, distance filter, and sync interval
5. Set a priority (higher priority profiles take precedence when multiple conditions match)
6. Tap **Create Profile** to save

## Condition Types

| Condition       | Trigger                                                   |
| --------------- | --------------------------------------------------------- |
| **Charging**    | Phone is plugged in to a power source                     |
| **Car Mode**    | Android Auto is connected                                 |
| **Speed Above** | Average speed exceeds the configured threshold (km/h)     |
| **Speed Below** | Average speed drops below the configured threshold (km/h) |
| **Stationary**  | Device not moving for approximately 60 seconds            |

Speed conditions use a rolling average of the last 5 GPS readings to avoid triggering on momentary speed spikes. The stationary condition uses a fixed speed threshold (0.3 m/s) with a 60-second timeout for reliable detection - unlike speed-below, it does not flap on GPS noise near zero.

:::tip Stationary profile When the device becomes stationary, the hardware significant motion sensor is armed. Even with a long GPS interval (e.g. 30 min), the profile deactivates the moment the device moves without waiting for the next GPS fix. The deactivation delay setting is not shown for stationary profiles since the motion sensor handles instant resume. Set the distance filter to **0m** so points are recorded at every interval regardless of GPS drift.

:::

:::caution Accuracy filtering matters for stationary detection The stationary condition triggers when GPS speed stays below 0.3 m/s for 60 seconds. If your default settings allow inaccurate locations (e.g. 40m+ accuracy) with a low distance filter (0m), GPS drift from noisy fixes can produce phantom speeds above the threshold - preventing the stationary profile from ever activating. To fix this, tighten your accuracy filter (e.g. 15m or less) so only clean fixes reach the speed check.

:::

## Profile Settings

Each profile overrides the default tracking configuration with:

- **GPS Interval** - How often to request a location fix (seconds)
- **Distance Filter** - Minimum movement required between updates (meters)
- **Sync Interval** - How often to sync with the server (Instant, 1 min, 5 min, 15 min, or Custom)
- **Priority** - Determines which profile wins when multiple conditions match simultaneously (higher = wins)
- **Deactivation Delay** - How long to wait after the condition stops matching before reverting to default settings (seconds). Prevents rapid toggling when conditions fluctuate.

When creating a new profile, GPS interval, distance filter, and sync interval are pre-filled with your current values from main Settings. Each field also shows a hint with the default value for reference.

## Priority

When multiple conditions match at the same time, the profile with the highest priority wins.

:::tip If you use both a Speed Below and a Stationary profile, give Stationary the higher priority. Otherwise the speed profile keeps GPS running at its interval and the stationary heartbeat never kicks in.

:::

## Example Configurations

| Profile    | Condition          | Interval | Distance | Priority | Use case                       |
| ---------- | ------------------ | -------- | -------- | -------- | ------------------------------ |
| Stationary | Stationary         | 1800s    | 0m       | 40       | Heartbeat while not moving     |
| Driving    | Car Mode           | 10s      | 1m       | 30       | Detailed route while driving   |
| Walking    | Speed Below 8 km/h | 60s      | 2m       | 20       | Battery-friendly on foot       |
| Charging   | Charging           | 15s      | 0m       | 10       | High accuracy while plugged in |

Note that Stationary has the highest priority so it takes over from Walking when you stop. Charging has the lowest priority so a more specific profile (e.g. Driving) wins when both match.

## How It Works

- When tracking starts, all enabled profiles are evaluated against current conditions
- The highest-priority matching profile's settings override the defaults
- When the condition no longer matches, a deactivation delay timer starts
- If the condition matches again before the delay expires, the timer is cancelled
- After the delay expires, settings revert to the defaults configured in the Settings screen
- Profile changes made in the editor take effect immediately on the running service

## Active Profile Indicators

When a profile is active, Colota shows it in two places:

- **Notification** - The foreground notification title changes from "Colota Tracking" to "Colota · ProfileName" (e.g., "Colota · Charging")
- **Dashboard** - An info card appears on the map showing the active profile name. When inside a pause zone, the pause card shows which profile will resume on exit (e.g., "Profile 'Charging' resumes on exit").

Both indicators disappear automatically when the profile deactivates (after the deactivation delay) or when tracking stops.
