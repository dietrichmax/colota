---
title: Privacy Policy
---

# Privacy Policy

**Last updated: February 14, 2026**

Colota ("the App") is a self-hosted GPS tracking application for Android, developed by Max Dietrich. This privacy policy explains what data the App collects, how it is used, and your rights regarding that data.

## Data Collection

### Location Data

The App collects the following location-related data when tracking is active:

- GPS coordinates (latitude, longitude)
- Altitude
- Speed
- Bearing (direction)
- Accuracy
- Timestamp

### Device Data

The App also collects:

- Battery level (0--100%)
- Battery status (charging, unplugged, full)

### What We Do NOT Collect

- No personal identifiers (name, email, phone number)
- No advertising IDs
- No device identifiers (IMEI, serial number)
- No usage analytics or telemetry
- No crash reports (unless opted in via Android system)

## Data Storage

All collected data is stored **locally on your device** in a SQLite database. The data is not accessible to other apps.

Authentication credentials (if configured) are encrypted using **AES-256-GCM** via Android's `EncryptedSharedPreferences`.

## Data Transmission

The App **only transmits data to a server endpoint that you configure**. No data is sent anywhere by default.

- Data is sent via HTTPS (HTTP is only allowed for local/private network addresses)
- The App makes no network calls to any third-party service
- No analytics, tracking pixels, or advertising networks are used
- No data is shared with the developer or any third party

## Data Sharing

Colota does not share your data with anyone. The only data transmission occurs to your own self-hosted server, if you choose to configure one.

## Third-Party Services

### Google Play

The App is distributed via Google Play, which may collect data according to [Google's Privacy Policy](https://policies.google.com/privacy). This is outside the App's control.

### No Other Third Parties

The App contains no third-party SDKs, analytics tools, advertising frameworks, or cloud services.

## Data Retention

Location data remains on your device until you delete it. You can:

- Export data in CSV, GeoJSON, GPX, or KML format
- Delete sent history
- Delete data older than a specified number of days
- Clear all data from the database

## Your Rights

Since all data is stored locally on your device, you have full control:

- **Access**: View all data in the app's Data Management screen
- **Export**: Export your data at any time in multiple formats
- **Delete**: Delete any or all data at any time
- **Portability**: Export and transfer your data freely

## Permissions

| Permission         | Purpose                                  |
| ------------------ | ---------------------------------------- |
| Location (Precise) | GPS tracking                             |
| Foreground Service | Background tracking with notification    |
| Boot Completed     | Auto-start tracking after device reboot  |
| Internet           | Server sync (not needed for offline use) |

## Children's Privacy

The App is not directed at children under 13. We do not knowingly collect data from children.

## Open Source

Colota is open source under the [AGPL-3.0 license](https://github.com/dietrichmax/colota). You can review the complete source code to verify these privacy practices.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted on this page with an updated revision date.

## Contact

For questions about this privacy policy, write to [colota@mxd.codes](mailto:colota@mxd.codes) or open an [issue on GitHub](https://github.com/dietrichmax/colota/issues).
