---
sidebar_position: 1
---

# Geofencing

Create zones where location recording stops automatically. These "pause zones" stop saving and syncing locations at places you visit often. GPS stays active to detect when you leave the zone.

## Use Cases

- **Home** - Don't track when at home
- **Work** - Stop recording during work hours
- **Frequent locations** - Save battery in places you visit often

## Setup

1. Go to the **Geofences** tab
2. Enter a name and radius
3. Tap the map to place the geofence
4. Enable **Pause Tracking**

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Geofences.png", label: "Geofence setup" }, ]} />

## How It Works

- Zone detection uses the Haversine formula (1-2ms per check)
- When entering a pause zone, location recording and syncing stops
- The notification shows "Paused: [Zone Name]"
- GPS continues running inside the zone to detect when you leave
- If you stay stationary inside a zone, GPS is paused after 60s (if stationary detection is enabled) - the hardware motion sensor then wakes GPS when you start moving
- When exiting the zone, tracking automatically resumes
- Zone checks happen every location update with minimal overhead
- You can create unlimited geofence zones

## Anchor Points

When you enter or exit a pause zone, Colota saves a synthetic location at the geofence center. This gives your tracks clean start and end points instead of starting or ending mid-road.

- **On enter:** An anchor point is logged at the zone center, then recording pauses
- **On exit:** Recording resumes and an anchor point is logged at the zone center

Anchor points use the geofence center coordinates (not your actual GPS position) and set accuracy to the zone radius. They are saved to the database and synced to your server like regular locations.
