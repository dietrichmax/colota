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

On Android 12+ the FOSS variant requests the platform's built-in fused location provider (an AOSP API, not Google Play Services), which adds Wi-Fi and cell tower fusion on ROMs that provide a network location backend. Without such a backend, or on Android 11 and older, it transparently uses raw GPS.

The Google Play variant uses `FusedLocationProvider` from Google Play Services for the same Wi-Fi and cell tower fusion on any Android version.

**GrapheneOS users:** You can use the GMS variant with sandboxed Google Play. GrapheneOS reroutes location requests to its own reimplementation of the Play geolocation service, so you get the accuracy benefits of `FusedLocationProvider` without sending location data to Google.

### Which variant should I use - FOSS or Google Play?

The **Google Play variant** is generally the better choice for most users. `FusedLocationProvider` combines GPS, Wi-Fi, cell towers and motion sensors to deliver faster fixes and better battery efficiency, especially indoors and in dense urban areas.

The **FOSS variant** uses the platform's fused location provider on Android 12+, which delivers comparable accuracy on stock ROMs. On de-Googled ROMs without a network location backend and on Android 11 or older it falls back to raw GPS - reliable outdoors, but cold-start fixes can be slower and indoor accuracy is weaker without Wi-Fi and cell tower fusion.

If avoiding (sandboxed) Play Services is a priority, the FOSS variant is a perfectly fine option. On GrapheneOS with sandboxed Google Play, the GMS variant gives you the accuracy benefits without sending location data to Google (see above).

### Why AGPL-3.0?

To ensure modifications stay open source, especially server-side components.

### How accurate is the tracking?

3-10 meters in open sky, 10-50 meters in urban areas. The [accuracy filter](/docs/configuration/gps-settings#accuracy-filter) helps remove poor fixes.

### Can I use maps without internet?

Yes. Go to **Settings > Offline Maps** to download map areas to your device. Pan and zoom the map to frame the area you want, give it a name, and tap **Download Area**. Downloaded tiles persist across app restarts and work without any network connection. See [Offline Maps](/docs/guides/offline-maps) for details.

### Can I export my location history?

Yes. Tap **Export** on the Dashboard to export in CSV, GeoJSON, GPX, or KML. See [Data Export](/docs/guides/data-export) for details.

### Can I back up everything and move to a new device?

Yes. Go to **Settings → Backup & Restore** to create a single password-encrypted `.colota` file containing your locations, settings, geofences and credentials. Restore it on the new device with the same password. See [Backup & Restore](/docs/guides/backup-restore) for details.

### I forgot my backup password, can I recover it?

No. Backups are encrypted with a key derived from your password. There is no recovery code, no email reset and no developer override. If the password is lost the data inside is unrecoverable. Store the password in a password manager before creating the backup.

### Will restoring a backup overwrite my current data?

Yes. Restore is replace-everything: locations, settings, geofences and credentials currently on the device are replaced by what's in the backup. There is no merge mode. If you want to keep the current data, take a backup of it first.

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

### Does Colota support mutual TLS (mTLS)?

Yes. Import a PKCS12 (`.p12` / `.pfx`) bundle in **Settings -> Connection -> Authentication & Headers -> Client Certificate (mTLS)**. The private key is stored in the OS keystore and the password isn't saved. For self-signed server certificates, import a CA in the same screen so trust is scoped to Colota only - no need to install a CA at the OS level. See the [mTLS guide](/docs/configuration/mtls) for details.

### I was using a CA installed in Android Settings for Colota - does it still work?

No, not anymore. As of this release, Colota only trusts system CAs and an optional CA you import in-app via mTLS Settings - user-installed device CAs are deliberately ignored. If sync starts failing with `Server certificate is not trusted...` after upgrading, you'll need to re-import your CA through the new in-app screen.

The migration is one-time: open Colota -> Settings -> Connection -> Authentication & Headers -> Client Certificate (mTLS) -> Trusted Server CA -> Import CA. The same `.crt` / `.pem` you originally installed in Android Settings works. See [Migrating from earlier behavior](/docs/configuration/mtls#migrating-from-earlier-behavior) for the full walkthrough.
