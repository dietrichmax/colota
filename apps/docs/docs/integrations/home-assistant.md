---
sidebar_position: 3
---

# Home Assistant

[Home Assistant](https://www.home-assistant.io/) is an open-source home automation platform.

Colota integrates with Home Assistant via the built-in [OwnTracks integration](https://www.home-assistant.io/integrations/owntracks/), which accepts location updates over HTTP.

## Setup

1. **Add the OwnTracks integration** in Home Assistant:
   - Go to **Settings > Devices & Services > Add Integration**
   - Search for **OwnTracks** and add it
   - Note the webhook URL shown after setup (e.g. `https://your-ha-instance/api/webhook/abc123`)
2. **Configure Colota**:
   - Go to **Settings > API Settings**
   - Select the **OwnTracks** template
   - Set the endpoint to your Home Assistant webhook URL:
     ```
     https://your-ha-instance/api/webhook/abc123
     ```
   - No authentication is needed - the webhook ID acts as the secret
   - Add the following **custom headers** - these are required for Home Assistant to create the `device_tracker` entity:

     | Header      | Value        | Description                                    |
     | ----------- | ------------ | ---------------------------------------------- |
     | `X-Limit-U` | e.g. `john`  | Your username - used as part of the entity ID  |
     | `X-Limit-D` | e.g. `phone` | Your device ID - used as part of the entity ID |

   Without these headers, Home Assistant will accept the webhook but will not create a device tracker entity. The entity will appear as `device_tracker.<username>_<device>`.

Your device will appear as a `device_tracker` entity in Home Assistant that you can use for automations, zones, and the map.

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

## Notes

- You can customize the tracker ID (`tid`) in the custom fields settings to distinguish multiple devices
- If you use Nabu Casa, use the `cloudhook_url` or `remote_ui_url` provided during setup for external access
- Home Assistant does not require a Bearer token or Basic Auth for webhook endpoints
