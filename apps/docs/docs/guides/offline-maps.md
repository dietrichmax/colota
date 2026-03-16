---
sidebar_position: 5
---

# Offline Maps

Download map areas to your device so the map works without an internet connection. Useful when tracking in areas with poor cell coverage - tunnels, remote trails, backcountry routes.

## Downloading an Area

1. Go to **Settings > Offline Maps**
2. Tap **Center on my location** or pan the map to your target area
3. Enter a **name** for the area
4. Set the **radius** (up to 100 km / 62 mi)
5. Choose a **detail level**:
   - **Standard** - Roads and towns, zoom levels 8-14. Smaller download, good for driving or cycling.
   - **Hiking** - Trails and paths, zoom levels 8-16. Larger download, needed for off-trail navigation.
6. Check the estimated size and tap **Download**

The download runs in the background. A progress bar shows completion percentage. You can navigate away and return - the download continues.

## Detail Levels

| Level    | Max Zoom | Best For                 | Relative Size |
| -------- | -------- | ------------------------ | ------------- |
| Standard | 14       | Roads, towns, cycling    | Smaller       |
| Hiking   | 16       | Trails, paths, off-trail | ~20x larger   |

Zoom level 16 has significantly more tiles than level 14 (4x more tiles per zoom level added). For a given area, Hiking detail can be 10-20x the size of Standard.

## Tile Limit

MapLibre caps offline packs at **100,000 tiles**. If your area would exceed this, Colota shows a warning before you download - the pack will still download but coverage will be incomplete at high zoom levels.

To avoid hitting the cap:

- Reduce the radius
- Switch from Hiking to Standard detail
- Download multiple smaller areas instead of one large one

## Storage

Downloaded areas are stored on the device by MapLibre's offline tile cache. They persist across app restarts. The **Offline Maps** screen shows the current size of each saved area.

To free up space, delete areas you no longer need.

## Managing Areas

From the **Offline Maps** screen you can:

- See all downloaded areas with their size and status
- Delete an area (removes all cached tiles for that area and clears the ambient tile cache)
- Start a new download

## Tips

- Download areas **before** you go - not when you're already out of coverage
- For long routes, download the corridor rather than a large circle to avoid the tile cap
- Standard detail is usually sufficient for road and bike navigation; only use Hiking if you need fine trail detail
- Offline maps only affect map rendering - GPS tracking, sync, and all other features work independently of the map tile cache
