---
sidebar_position: 1
---

# Sync Presets

Colota includes built-in presets that configure tracking interval, movement threshold, sync interval, and retry behavior together.

| Preset          | Interval | Distance | Sync Interval | Retry Interval | Best For        |
| --------------- | -------- | -------- | ------------- | -------------- | --------------- |
| **Instant**     | 5s       | 0m       | Instant (0s)  | 30s            | City navigation |
| **Balanced**    | 30s      | 1m       | 5 minutes     | 5 minutes      | Daily commute   |
| **Power Saver** | 60s      | 2m       | 15 minutes    | 15 minutes     | Long trips      |
| **Custom**      | 1s--∞    | 0m--∞    | 0s--∞         | 30s--∞         | Advanced users  |

Select a preset in **Settings** or choose **Custom** to configure each parameter individually.
