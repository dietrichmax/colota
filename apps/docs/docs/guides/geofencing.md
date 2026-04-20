---
sidebar_position: 1
---

# Geofencing

Create zones where location recording stops automatically. These "pause zones" stop saving and syncing locations at places you visit often. Each zone can also be configured to stop GPS entirely when on WiFi or when the device is motionless.

## Use Cases

- **Home** - Don't track when at home
- **Work** - Stop recording during work hours
- **Frequent locations** - Save battery in places you visit often

## Setup

1. Go to the **Geofences** tab
2. Enter a name and radius
3. Tap **Place Geofence**, then tap the map to place it
4. Tap the **›** arrow on any geofence to open the editor and configure pause options

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Geofences.png", label: "Geofences" }, { src: "/img/screenshots/GeofenceEditor.png", label: "Geofence Editor" }, ]} />

## GPS Pause Options

Each geofence has independent pause settings, configured in the editor (tap **›**):

### Don't record in zone

Locations are not saved or synced while inside the zone. GPS continues running to detect when you leave. This is the default behavior.

This is also the master switch for the other pause options below. WiFi pause, motionless pause and the stationary heartbeat only take effect when this is on.

### Pause when on WiFi or Ethernet

Stops GPS entirely when connected to an unmetered network (home WiFi, Ethernet). GPS resumes automatically when the connection is lost. Useful if you want to completely stop GPS while at home on WiFi, saving additional battery.

### Pause when motionless

Stops GPS after no device motion is detected for a configurable time (default 10 minutes). GPS resumes automatically when the device moves again. Useful for users who put their phone in airplane mode at night or sit still for long periods.

### Stationary heartbeat

Sends a periodic location update to your server while paused inside the zone. Useful as a proof-of-presence signal so your backend knows the device is still there. The heartbeat sends the geofence center as a synthetic anchor point (no GPS wake), bypassing normal sync conditions like Wi-Fi only. Configure the interval in minutes (default 15).

### Combined behavior

When both **WiFi** and **motionless** pause are enabled, GPS only resumes when **both** conditions clear - WiFi must be disconnected **and** motion must be detected. Either condition alone is not enough to resume.

:::tip Changes made in the editor take effect immediately, even when you are already inside the zone.

:::

## How It Works

- Zone detection uses the Haversine formula (1-2ms per check)
- When entering a pause zone, Colota keeps recording for 3.5× your tracking interval before pausing - this logs several real arrival points near the zone boundary, which backends like GeoPulse need to confirm a trip has ended
- The notification shows "Paused: [Zone Name]" once the pause takes effect
- By default, GPS continues running inside the zone to detect when you leave. If **WiFi pause** or **motionless pause** is enabled, GPS stops entirely inside the zone and zone exit is detected when GPS resumes
- If you leave before the entry delay completes, the delay is cancelled and tracking continues uninterrupted
- Stationary detection is suspended inside zones so GPS is never stopped by the stationary timer while zone exit needs to be detected
- When exiting the zone, tracking automatically resumes
- Zone checks happen every location update with minimal overhead
- You can create unlimited geofence zones

## Anchor Points

When you exit a pause zone, Colota saves a synthetic location at the geofence center. This gives your new trip a clean start point rather than somewhere mid-road where GPS first locks in. Anchor points use the zone radius as their accuracy value and are timestamped 1 second before the first real GPS fix after leaving the zone, ensuring correct chronological order.
