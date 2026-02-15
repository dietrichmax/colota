---
sidebar_position: 3
---

# OwnTracks

[OwnTracks](https://owntracks.org/) is an open-source location tracking platform.

## Setup

1. **Install OwnTracks Recorder** - follow the [OwnTracks documentation](https://owntracks.org/booklet/)
2. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **OwnTracks** template
   - Set your endpoint URL, e.g. `https://owntracks.yourdomain.com/pub`
   - If your Recorder uses HTTP Basic Auth, configure it in **Settings > Authentication & Headers**

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

The template adds `_type: "location"` and `tid: "AA"` (tracker ID) automatically. You can customize the tracker ID in the custom fields settings.
