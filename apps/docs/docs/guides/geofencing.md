---
sidebar_position: 1
---

# Geofencing

Create zones where tracking pauses automatically. These "silent zones" save battery and stop recording at places you visit often.

## Use Cases

- **Home** -- Don't track when at home
- **Work** -- Pause tracking during work hours
- **Frequent locations** -- Save battery in places you visit often

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

- Zone detection uses the Haversine formula (1--2ms per check)
- When entering a silent zone, GPS stops updating
- The notification shows "Paused: [Zone Name]"
- When exiting the zone, tracking automatically resumes
- Zone checks happen every location update with minimal overhead
- You can create unlimited geofence zones
