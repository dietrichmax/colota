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
- When entering a pause zone, Colota keeps recording for 3.5× your tracking interval before pausing - this logs several real arrival points near the zone boundary, which backends like GeoPulse need to confirm a trip has ended
- The notification shows "Paused: [Zone Name]" once the pause takes effect
- GPS continues running inside the zone to detect when you leave
- If you leave before the entry delay completes, the delay is cancelled and tracking continues uninterrupted
- If you stay stationary inside a zone, GPS is paused after 60s (if stationary detection is enabled) - the hardware motion sensor then wakes GPS when you start moving. Stationary detection is suspended during the entry delay so arrival points keep being logged even if you stop moving on arrival
- When exiting the zone, tracking automatically resumes
- Zone checks happen every location update with minimal overhead
- You can create unlimited geofence zones

## Anchor Points

When you exit a pause zone, Colota saves a synthetic location at the geofence center. This gives your new trip a clean start point at the zone center rather than somewhere mid-road where GPS first locks in.

- **On exit:** An anchor point is logged at the zone center, then recording resumes

Anchor points use the geofence center coordinates (not your actual GPS position) and set accuracy to the zone radius. They are saved to the database and synced to your server like regular locations.
