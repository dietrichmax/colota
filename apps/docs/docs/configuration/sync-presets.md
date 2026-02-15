---
sidebar_position: 1
---

# Sync Presets

Colota includes built-in presets that configure tracking interval, movement threshold, and sync interval together.

| Preset          | Interval | Distance | Sync Interval | Best For        |
| --------------- | -------- | -------- | ------------- | --------------- |
| **Instant**     | 5s       | 0m       | Instant (0s)  | City navigation |
| **Balanced**    | 30s      | 1m       | 5 minutes     | Daily commute   |
| **Power Saver** | 60s      | 2m       | 15 minutes    | Long trips      |
| **Custom**      | 1s-∞     | 0m-∞     | 0s-∞          | Advanced users  |

Select a preset in **Settings** or choose **Custom** to configure each parameter individually.

## Wi-Fi Only Sync

When enabled, Colota queues locations locally and only uploads when connected to an unmetered network (Wi-Fi, Ethernet). Uploads are skipped on cellular data.

This is useful for:

- **Limited mobile data** — Avoid using cellular bandwidth for location uploads
- **Roaming** — Prevent expensive data charges while traveling abroad
- **Battery savings** — Reduce radio usage on metered connections

Toggle this in **Settings > Advanced Settings > Network Settings > Wi-Fi Only Sync**. Locations continue to be recorded and queued regardless of this setting — they sync automatically once Wi-Fi is available.
