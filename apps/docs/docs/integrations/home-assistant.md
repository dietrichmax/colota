---
sidebar_position: 3
---

# Home Assistant

[Home Assistant](https://www.home-assistant.io/) is an open-source home automation platform.

Colota has a dedicated Home Assistant integration that receives location updates via webhook and creates `device_tracker` entities. The integration source code is available on [GitHub](https://github.com/dietrichmax/colota-home-assistant).

## Setup

### 1. Install the Colota integration

**Via HACS (recommended):**

1. Open HACS in Home Assistant
2. Go to **Integrations**
3. Click the three dots menu and select **Custom repositories**
4. Add `https://github.com/dietrichmax/colota-home-assistant` as an **Integration**
5. Search for **Colota** and install it
6. Restart Home Assistant

**Manual:**

1. Copy the `custom_components/colota` folder to your Home Assistant `config/custom_components/` directory
2. Restart Home Assistant

### 2. Add the integration

1. Go to **Settings > Devices & Services > Add Integration**
2. Search for **Colota** and add it
3. Copy the webhook URL shown after setup

### 3. Configure the Colota app

1. Go to **Settings > API Settings**
2. Paste the webhook URL as the endpoint
3. No authentication is needed - the webhook URL acts as the secret

The integration works with the default API format out of the box. To distinguish multiple devices, add a custom field `tid` with a unique value per device (e.g. `colota-phone`, `colota-tablet`).

Your device will appear as a `device_tracker` entity in Home Assistant that you can use for automations, zones and the map.

## Payload

Colota sends the following payload:

```json
{
  "lat": 51.5074,
  "lon": -0.1278,
  "acc": 15,
  "alt": 20,
  "vel": 1.5,
  "batt": 85,
  "bs": 2,
  "bear": 180,
  "tid": "colota",
  "tst": 1704067200
}
```

The `tid` field is used as the device identifier in Home Assistant. You can customize it in the custom fields settings to distinguish multiple devices.

## Notes

- If you use Nabu Casa, the integration will automatically generate a cloud webhook URL for external access
- The integration supports multiple devices - each unique `tid` value creates a separate `device_tracker` entity

## Alternative: OwnTracks integration

If you prefer not to install a custom integration, you can use Home Assistant's built-in [OwnTracks integration](https://www.home-assistant.io/integrations/owntracks/) instead:

1. Add the **OwnTracks** integration in Home Assistant and note the webhook URL
2. In the Colota app, select the **OwnTracks** template and set the endpoint to the webhook URL
3. Add the following custom headers:

   | Header      | Value        | Description                                    |
   | ----------- | ------------ | ---------------------------------------------- |
   | `X-Limit-U` | e.g. `john`  | Your username - used as part of the entity ID  |
   | `X-Limit-D` | e.g. `phone` | Your device ID - used as part of the entity ID |

   Without these headers, Home Assistant will not create a device tracker entity.
