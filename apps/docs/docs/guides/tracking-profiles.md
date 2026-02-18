---
sidebar_position: 2
---

# Tracking Profiles

Tracking profiles automatically adjust GPS interval, distance filter, and sync settings when conditions like charging, car mode, or speed thresholds are met.

## Use Cases

- **Charging** - Increase tracking frequency while plugged in (battery isn't a concern)
- **Driving** - Switch to frequent updates when Android Auto connects or speed exceeds a threshold
- **Walking** - Use longer intervals at low speeds to conserve battery
- **Parked** - Reduce updates when stationary with a speed-below profile

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

Speed conditions use a rolling average of the last 5 GPS readings to avoid triggering on momentary speed spikes.

## Profile Settings

Each profile overrides the default tracking configuration with:

- **GPS Interval** - How often to request a location fix (seconds)
- **Distance Filter** - Minimum movement required between updates (meters)
- **Sync Interval** - How often to sync with the server (Instant, 1 min, 5 min, or 15 min)
- **Priority** - Determines which profile wins when multiple conditions match simultaneously (higher = wins)
- **Deactivation Delay** - How long to wait after the condition stops matching before reverting to default settings (seconds). Prevents rapid toggling when conditions fluctuate.

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
