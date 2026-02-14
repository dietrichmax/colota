---
sidebar_position: 2
---

# Dawarich

[Dawarich](https://github.com/Freika/dawarich) is a self-hosted location history service.

## Setup

1. **Install Dawarich** -- follow the [Dawarich documentation](https://github.com/Freika/dawarich)
2. **Get your API Key** from Dawarich settings
3. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **Dawarich** template
   - Set your endpoint:
     ```
     https://dawarich.yourdomain.com/api/v1/owntracks/points?api_key=YOUR_API_KEY
     ```
   - Choose a sync mode (e.g., Batch 5 minutes)

## Payload Format

The Dawarich template auto-configures the following payload:

```json
{
  "_type": "location",
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

Note: Dawarich uses `cog` (course over ground) instead of `bear` for the bearing field.
