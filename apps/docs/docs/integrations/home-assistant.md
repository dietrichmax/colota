---
sidebar_position: 3
---

# Home Assistant

[Home Assistant](https://www.home-assistant.io/) is an open-source home automation platform.

Colota has a dedicated Home Assistant integration that receives location updates via webhook and creates a location tracker, a battery sensor and a charging sensor per device. The integration source code is available on [GitHub](https://github.com/dietrichmax/colota-home-assistant).

## Setup

### 1. Install the Colota integration

**Via HACS (recommended):**

Colota is in the HACS default store, so no custom repository is needed.

1. Open HACS in Home Assistant
2. Search for **Colota** and install it
3. Restart Home Assistant

**Manual:**

1. Copy the `custom_components/colota` folder to your Home Assistant `config/custom_components/` directory
2. Restart Home Assistant

### 2. Add the integration

1. Go to **Settings > Devices & Services > Add Integration**
2. Search for **Colota** and add it
3. Copy the webhook URL shown after setup

### 3. Configure the Colota app

1. Go to **Settings > Connection**
2. Paste the webhook URL as the **Server endpoint**
3. No authentication is needed - the webhook URL acts as the secret

The integration works with the default API format out of the box. Without a `tid` field all updates go to one device named `colota`. To distinguish multiple devices, add a custom field `tid` with a unique value per device (e.g. `phone`, `tablet`).

## Entities

Each device creates three entities:

| Entity           | Source field | Description                                             |
| ---------------- | ------------ | ------------------------------------------------------- |
| `device_tracker` | `lat`, `lon` | Location, for automations, zones and the map            |
| `sensor`         | `batt`       | Battery level in percent                                |
| `binary_sensor`  | `bs`         | Charging, on while `bs` is `2` (charging) or `3` (full) |

## Payload

The integration reads the following payload. `tid` is only sent once you add it as a custom field:

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
  "tid": "phone",
  "tst": 1704067200
}
```

The `tid` field is used as the device identifier in Home Assistant. You can customize it in the custom fields settings to distinguish multiple devices.

## Notes

- If you use Nabu Casa, the integration will automatically generate a cloud webhook URL for external access
- The integration is added once per Home Assistant instance and all devices share its webhook URL - each unique `tid` value creates a separate device

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
