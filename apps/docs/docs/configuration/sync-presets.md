---
sidebar_position: 1
---

# Sync Presets

Colota includes built-in presets that configure tracking interval, movement threshold, and sync interval together.

| Preset          | Interval | Distance | Sync Interval | Best For        |
| --------------- | -------- | -------- | ------------- | --------------- |
| **Instant**     | 5s       | 0m       | Instant (0s)  | City navigation |
| **Balanced**    | 30s      | 2m       | 5 minutes     | Daily commute   |
| **Power Saver** | 60s      | 2m       | 15 minutes    | Long trips      |
| **Custom**      | 1s-∞     | 0m-∞     | 0s-∞          | Advanced users  |

Select a preset in **Settings → Tracking & Sync** or choose **Custom** to configure each parameter individually.

## Sync Condition

Controls when Colota uploads locations. Locations are always recorded and queued locally regardless of this setting.

| Option            | Behavior                                               |
| ----------------- | ------------------------------------------------------ |
| **Any Network**   | Upload on any connection (default)                     |
| **Wi-Fi Only**    | Upload only on unmetered networks (Wi-Fi, Ethernet)    |
| **Specific SSID** | Upload only when connected to a specific Wi-Fi network |
| **VPN**           | Upload only when a VPN connection is active            |

This is useful for:

- **Limited mobile data** - Avoid using cellular bandwidth for location uploads
- **Private backends** - Only sync when on your home network or VPN
- **Roaming** - Prevent expensive data charges while traveling abroad

Configure this in **Settings → Tracking & Sync → Advanced Settings → Network Settings → Sync Only On**.

## Offline Mode

In [offline mode](/docs/configuration/server-settings#offline-mode), network settings (sync interval, retry behavior, sync condition) are hidden since no syncing occurs. Preset descriptions adjust to show only tracking parameters. For displaying the maps network requests are still made to maps.mxd.codes. See [Offline Maps](/docs/guides/offline-maps) for predownloading maps.
