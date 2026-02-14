---
sidebar_position: 7
---

# FAQ

### Do I need a server?

No. The app stores location history locally. Server sync is optional.

### What data does the app send?

Only GPS data (coordinates, accuracy, altitude, speed, bearing, battery status, timestamp) to your configured server. Nothing else. No analytics, no telemetry.

### Is this compatible with Google Timeline?

No, but you can use [Dawarich](/docs/integrations/dawarich) or a custom backend for similar functionality.

### Does this work without Google Play Services?

Not currently -- Colota uses Android's `FusedLocationProvider` which requires Google Play Services.

### Why AGPL-3.0?

To ensure modifications stay open source, especially server-side components.

### How accurate is the tracking?

3--10 meters in open sky, 10--50 meters in urban areas. The [accuracy filter](/docs/configuration/gps-settings#accuracy-filter) helps remove poor fixes.

### Can I export my location history?

Yes. Go to **Data Management > Export Data** to export in CSV, GeoJSON, GPX, or KML. See [Data Export](/docs/guides/data-export) for details.

### What happens when the phone restarts?

If auto-start on boot is enabled, Colota automatically resumes tracking after a device restart.

### How much battery does it use?

Depends on your settings. With the **Balanced** preset (30s interval, batch sync), typical usage is moderate. See [Battery Optimization](/docs/guides/battery-optimization) for tips.

### What Android versions are supported?

Colota requires Android 8.0 (API 26) or higher.
