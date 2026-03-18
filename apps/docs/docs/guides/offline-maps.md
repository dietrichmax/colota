---
sidebar_position: 5
---

# Offline Maps

Download map areas to your device so the map works without an internet connection. Useful when tracking in areas with poor cell coverage - remote trails, backcountry routes, etc.

## Downloading an Area

1. Go to **Settings > Offline Maps**
2. Pan and zoom the map to frame the area you want to download
3. Tap the location button to center on your current position if needed
4. Enter a **name** for the area
5. Check the estimated size and tap **Download Area**

The download runs in the background. A progress bar shows completion percentage. You can navigate away and return - the download continues.

## Zoom Levels

Offline packs cover zoom levels 8-14. This matches the maximum resolution served by the default tile server (maps.mxd.codes) and [OpenFreeMap](https://openfreemap.org). MapLibre uses vector overzooming to render zoom levels above 14 from z14 tiles - you get the same visual detail whether online or offline.

## Tile Limit

Colota caps offline packs at **100,000 tiles**. If your area would exceed this, a warning is shown before you download - the pack will still download but coverage will be incomplete at high zoom levels.

To avoid hitting the cap:

- Zoom out or pan to frame a smaller area
- Download multiple smaller areas instead of one large one

## Storage

Downloaded areas are stored on the device by MapLibre's offline tile cache. They persist across app restarts. The **Offline Maps** screen shows the current size of each saved area.

To free up space, delete areas you no longer need. When the last area is deleted, the tile database is reset and the storage is reclaimed by the OS.

## Managing Areas

From the **Offline Maps** screen you can:

- See all downloaded areas with their size and status
- Delete an area (removes all cached tiles for that area)
- Start a new download

## Tips

- Download areas **before** you go - not when you're already out of coverage
- For long routes, download the corridor rather than a large bounding box to stay within the tile cap
- Offline maps only affect map rendering - GPS tracking, sync, and all other features work independently of the map tile cache
