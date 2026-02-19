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

<div className="screenshot-gallery">
  <figure>
    <img src="/img/screenshots/Geofences.png" alt="Geofence setup" />
    <figcaption>Geofence setup</figcaption>
  </figure>
</div>

## How It Works

- Zone detection uses the Haversine formula (1-2ms per check)
- When entering a pause zone, location recording and syncing stops
- The notification shows "Paused: [Zone Name]"
- When exiting the zone, tracking automatically resumes
- Zone checks happen every location update with minimal overhead
- You can create unlimited geofence zones
