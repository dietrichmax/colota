---
title: "Location history"
description: "Days, trips, points, exports and the summary"
---

The **History** tab shows one day of recordings at a time: the track on a map, the day's trips and every point. It reads the database on the phone, so it works without a server.

{{< screenshots "LocationHistory|Location history" "Trips|Trips" "TripDetails|Trip detail" >}}

## Picking a Day

- **Chevrons** - Step one day back or forward
- **Calendar** - Tap the date to open it. A day with data carries a dot under its number. Tap the calendar's header to pick a year, then a month
- **Go to today** - In the app bar on any other day
- **Last day with data** - Offered on a day with nothing recorded

## Views

Three tabs sit under the date:

| View | Shows |
| --- | --- |
| **Map** | The day's track, one colour per trip. Each trip starts at a solid disc and ends at a ring |
| **Trips** | One row per trip with its start and end time, distance and duration |
| **Data** | Every point as a table row: time, coordinates, accuracy, altitude, speed, bearing, battery, power, time since the previous fix, sync and note |

On the map, tap a trip in the strip at the bottom to highlight it, and tap it again to show the whole day. In the Data view, tap a row's time to show that point on the map.

## Points

Tap a point on the map to open its card:

- **Coordinates** - Tap to copy them
- **Speed**, **Accuracy** and **Altitude** - Shown when the fix carried them
- **Sync** - Sent or Queued, shown when a server is set
- **Note** - Tap to add or edit a note on the point
- **Delete** - Removes the point from this device only. A point that already synced stays on your server, and one that has not synced is never uploaded

## Trips

A new trip starts after 15 minutes or more without a fix. A day whose points never spread more than 100 m has no trips, and **Show points** opens them in the Data view.

Tap a trip in the Trips view to open **Trip detail**:

- The trip on its own map, with chevrons to the previous and next trip
- Distance, duration, average speed and the point count, plus elevation gain and loss when the trip climbed or descended
- Speed and elevation charts, when the fixes carry speed or altitude
- **Export trip** and **Delete trip** in the app bar

Long-press a trip to select it, then tap more trips to add them. The app bar then offers **Export selected trips**, **Merge trips** for two or more trips that follow each other, **Delete trips** and **More** for selecting all or clearing the selection. Deleting removes the points from this device only.

To fix where a trip starts or ends, see [Editing trips](./editing-trips).

## Exporting

- **Export day** - In the app bar on a day with trips
- **Export trip** - On Trip detail
- **Export selected trips** - In selection mode

Each opens the format picker. See [Data export](./data-export) for the formats.

## Summary

**Location summary** in the app bar opens **Summary**: distance, trips, active days and average distance per day for a week or a month. Pick **Week** or **Month**, step with the chevrons and tap a day to open it in Location history. There is no year or all-time view.
