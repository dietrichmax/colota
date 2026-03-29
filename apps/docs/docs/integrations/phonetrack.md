---
sidebar_position: 5
---

# PhoneTrack (Nextcloud)

[PhoneTrack](https://apps.nextcloud.com/apps/phonetrack) is a Nextcloud app for tracking mobile devices.

## Setup

1. **Install PhoneTrack** from the Nextcloud app store
2. **Create a session** in PhoneTrack
3. **Get the logging URL**: Click the sharing icon next to your session to reveal the logging URLs. Copy the **OwnTracks** URL:
   ```
   https://nextcloud.yourdomain.com/apps/phonetrack/log/owntracks/SESSION_TOKEN/DEVICE_NAME
   ```
4. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **OwnTracks** template
   - Paste the URL as your endpoint

:::tip Which PhoneTrack URL to use? PhoneTrack offers several logging URLs (OwnTracks, GPS Logger, OpenGTS, etc.). Use the **OwnTracks** URL since Colota sends location data as a JSON POST body, which matches the OwnTracks protocol. The other URLs (like GPS Logger) expect query parameters and may not work correctly.

:::

## Payload Format

The OwnTracks template auto-configures the following payload:

```json
{
  "_type": "location",
  "tid": "AA",
  "lat": 51.495065,
  "lon": -0.043945,
  "acc": 12,
  "alt": 519,
  "vel": 0,
  "batt": 85,
  "bs": 2,
  "tst": 1704067200,
  "cog": 180.5
}
```
