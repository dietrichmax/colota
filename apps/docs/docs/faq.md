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

Yes. The **FOSS variant** (available on F-Droid, IzzyOnDroid and GitHub Releases) uses Android's native `LocationManager` and has no Google Play Services dependency. It works on LineageOS, GrapheneOS, CalyxOS and any ROM without Google services.

The Google Play variant uses `FusedLocationProvider` for potentially better location accuracy through Wi-Fi and cell tower fusion.

**GrapheneOS users:** You can use the GMS variant with sandboxed Google Play. GrapheneOS reroutes location requests to its own reimplementation of the Play geolocation service, so you get the accuracy benefits of `FusedLocationProvider` without sending location data to Google.

### Why AGPL-3.0?

To ensure modifications stay open source, especially server-side components.

### How accurate is the tracking?

3-10 meters in open sky, 10-50 meters in urban areas. The [accuracy filter](/docs/configuration/gps-settings#accuracy-filter) helps remove poor fixes.

### Can I use maps without internet?

Yes. Go to **Settings > Offline Maps** to download map areas to your device. Pan and zoom the map to frame the area you want, give it a name, and tap **Download Area**. Downloaded tiles persist across app restarts and work without any network connection. See [Offline Maps](/docs/guides/offline-maps) for details.

### Can I export my location history?

Yes. Tap **Export** on the Dashboard to export in CSV, GeoJSON, GPX, or KML. See [Data Export](/docs/guides/data-export) for details.

### What happens when the phone restarts?

If auto-start on boot is enabled, Colota automatically resumes tracking after a device restart when tracking was active before.

### How much battery does it use?

Depends on your settings. With the **Balanced** preset (30s interval, batch sync), typical usage is moderate. See [Battery Optimization](/docs/guides/battery-optimization) for tips.

### How do I update the app?

- **Google Play** - updates automatically, or open the Play Store and tap Update
- **F-Droid** - open the F-Droid client and update from there, or use [Obtainium](https://github.com/ImranR98/Obtainium) to track releases automatically
- **IzzyOnDroid** - open the IzzyOnDroid client and update from there, or use [Obtainium](https://github.com/ImranR98/Obtainium) to track releases automatically
- **GitHub Releases** - download the latest APK from [GitHub Releases](https://github.com/dietrichmax/colota/releases) and install it - Android will update the existing app in place

### Is there an iOS version?

No, and none is currently planned. The UI is React Native, but the core of the app - background location tracking, the foreground service, geofencing, and sync scheduling - is all native Android Kotlin code that would need to be rewritten from scratch for iOS. Beyond the technical effort, Apple's developer account costs 100 EUR/year, maintaining two platforms would significantly increase the ongoing work, and testing without a real iPhone would be impractical.

If an iOS version were ever built, it would realistically need to be a paid app to offset the cost and effort - which would shift this from a hobby project into something with different expectations. It's not off the table forever, but there are no concrete plans.

### What Android versions are supported?

Colota requires Android 8.0 (API 26) or higher.

### Why does Colota ask for "Local network access" permission?

On Android 17+, apps need the Local Network Access permission to connect to local network addresses. Colota only requests this when your server is on a private/local IP (e.g. `192.168.x.x`). It is not used for device scanning or discovery, only to reach your self-hosted server. On some Android 16 devices, this may be enforced early via security patches under the "Nearby devices" permission name.
