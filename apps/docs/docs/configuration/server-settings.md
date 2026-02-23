---
sidebar_position: 3
---

# Server Settings

| Setting              | Description                               | Default         | Range      |
| -------------------- | ----------------------------------------- | --------------- | ---------- |
| Endpoint             | HTTPS URL of your server                  | Empty (offline) | --         |
| HTTP Method          | POST (JSON body) or GET (query params)    | POST            | POST / GET |
| Sync Interval        | Batch mode interval                       | Instant (0)     | 0s - 15min |
| Retry Failed Uploads | Keep retrying failed uploads indefinitely | Off             | On/Off     |
| Offline Mode         | Disable all network activity              | Disabled        | On/Off     |

## Endpoint URL

Your server endpoint must accept HTTPS requests (POST or GET depending on your HTTP Method setting). HTTP is only allowed for private/local addresses:

- `127.0.0.1` / `localhost`
- `192.168.x.x`
- `10.x.x.x`
- `172.16.x.x – 172.31.x.x`
- `100.64.x.x – 100.127.x.x` (CGNAT)
- `169.254.x.x` (link-local)

On **Android 17+**, connecting to another device on the local network (everything above except `localhost`) requires the **Nearby Wi-Fi Devices** permission. Colota requests this when you use **Test Connection**. See [Permissions](/docs/development/permissions#local-network-nearby-wi-fi-devices) for details.

Use the **Test Connection** button in settings to verify your server is reachable.

## Sync Modes

- **Instant (0s)**: Each location is sent immediately after recording
- **Batch (1-60 min)**: Locations are queued and sent in batches at the configured interval
- **Offline**: No network activity - data is stored locally only

## Retry Behavior

When a sync attempt fails, Colota retries with exponential backoff:

```
Attempt 1: Immediate
Attempt 2: +30s
Attempt 3: +60s (1 minute)
Attempt 4: +300s (5 minutes)
Attempt 5+: +900s (15 minutes)
```

By default, failed uploads are **permanently deleted after 5 failed send attempts**. Enable **Retry Failed Uploads** in advanced settings to keep retrying indefinitely - failed uploads stay in the queue until they succeed. Note that this may cause queue buildup if your server is unreachable for extended periods.

The app also auto-syncs when network connectivity is restored.
