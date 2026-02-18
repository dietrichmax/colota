---
sidebar_position: 7
---

# Deep Link Setup

Configure Colota instantly using a `colota://setup` URL. Generate a link or QR code with your server settings and share it with users — no manual typing required.

## URL Format

```
colota://setup?config=BASE64_ENCODED_JSON
```

The `config` parameter is a base64-encoded JSON object. Only include the settings you want to change — everything else keeps its current value.

## Supported Parameters

```json
{
  "endpoint": "https://my-server.com/api/locations",
  "interval": 10,
  "distance": 5,
  "syncInterval": 300,
  "maxRetries": 5,
  "retryInterval": 30,
  "accuracyThreshold": 50,
  "filterInaccurateLocations": true,
  "isOfflineMode": false,
  "isWifiOnlySync": false,
  "apiTemplate": "owntracks",
  "httpMethod": "POST",
  "fieldMap": {
    "lat": "lat",
    "lon": "lon",
    "acc": "acc",
    "alt": "alt",
    "vel": "vel",
    "batt": "batt",
    "bs": "bs",
    "tst": "tst",
    "bear": "cog"
  },
  "customFields": [
    { "key": "_type", "value": "location" },
    { "key": "tid", "value": "AA" }
  ],
  "auth": {
    "type": "bearer",
    "bearerToken": "my-secret-token-123"
  },
  "customHeaders": {
    "X-Api-Key": "abc123",
    "CF-Access-Client-Id": "my-cf-id"
  }
}
```

### Parameter Reference

| Parameter                   | Type    | Description                                                             |
| --------------------------- | ------- | ----------------------------------------------------------------------- |
| `endpoint`                  | string  | Server URL to send location data to                                     |
| `interval`                  | number  | GPS polling interval in seconds (must be > 0)                           |
| `distance`                  | number  | Minimum movement in meters before recording a new location              |
| `syncInterval`              | number  | Batch sync interval in seconds (0 = instant)                            |
| `maxRetries`                | number  | Max retry attempts for failed uploads                                   |
| `retryInterval`             | number  | Seconds between retry attempts                                          |
| `accuracyThreshold`         | number  | Discard locations less accurate than this (meters)                      |
| `filterInaccurateLocations` | boolean | Enable accuracy filtering                                               |
| `isOfflineMode`             | boolean | Store locally only, never sync                                          |
| `isWifiOnlySync`            | boolean | Only sync on Wi-Fi                                                      |
| `apiTemplate`               | string  | `custom`, `dawarich`, `owntracks`, `phonetrack`, `reitti`, or `traccar` |
| `httpMethod`                | string  | `POST` or `GET`                                                         |
| `fieldMap`                  | object  | Custom field name mapping for the JSON payload                          |
| `customFields`              | array   | Static key-value pairs added to every payload                           |
| `auth.type`                 | string  | `none`, `basic`, or `bearer`                                            |
| `auth.username`             | string  | Username for Basic Auth                                                 |
| `auth.password`             | string  | Password for Basic Auth                                                 |
| `auth.bearerToken`          | string  | Token for Bearer Auth                                                   |
| `customHeaders`             | object  | Custom HTTP headers (e.g. Cloudflare Access)                            |

## Generating a Setup Link

### Using Node.js

```bash
node -e "
const config = {
  endpoint: 'https://my-server.com/api/locations',
  interval: 10,
  apiTemplate: 'owntracks',
  auth: { type: 'bearer', bearerToken: 'my-token' }
};
const encoded = Buffer.from(JSON.stringify(config)).toString('base64');
console.log('colota://setup?config=' + encoded);
"
```

### Using Python

```bash
python3 -c "
import json, base64
config = {'endpoint': 'https://my-server.com/api/locations', 'interval': 10}
encoded = base64.b64encode(json.dumps(config).encode()).decode()
print(f'colota://setup?config={encoded}')
"
```

### QR Code

Generate a QR code from the `colota://setup?config=...` URL using any QR generator. When scanned, Android opens Colota and navigates directly to the confirmation screen.

## How It Works

1. User taps the link or scans a QR code
2. Colota opens and shows a confirmation screen listing all settings that will be applied
3. Sensitive values (passwords, tokens) are masked in the preview
4. User taps **Apply Configuration** to save or **Cancel** to discard
5. Settings are persisted and the app navigates to the Dashboard

## Testing with ADB

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "colota://setup?config=BASE64_HERE" com.Colota
```

## Security Notes

- The configuration URL is not encrypted. Avoid putting sensitive tokens in QR codes displayed in public.
- All settings are shown to the user for confirmation before being applied.
- Auth credentials are stored in AES-256-GCM encrypted storage on device after import.
