---
sidebar_position: 3
---

# Server Settings

| Setting              | Description                               | Default         | Range       |
| -------------------- | ----------------------------------------- | --------------- | ----------- |
| Endpoint             | HTTPS URL of your server                  | Empty (offline) | --          |
| HTTP Method          | POST (JSON body) or GET (query params)    | POST            | POST / GET  |
| Sync Interval        | Batch mode interval                       | Instant (0)     | 0s - Custom |
| Retry Failed Uploads | Keep retrying failed uploads indefinitely | Off             | On/Off      |
| Offline Mode         | Disable all network activity              | Disabled        | On/Off      |

## Endpoint URL

Your server endpoint must accept HTTPS requests (POST or GET depending on your HTTP Method setting). HTTP is only allowed for private/local addresses:

- `127.0.0.1` / `localhost`
- `192.168.x.x`
- `10.x.x.x`
- `172.16.x.x – 172.31.x.x`
- `100.64.x.x – 100.127.x.x` (CGNAT)
- `169.254.x.x` (link-local)

On **Android 17+**, connecting to another device on the local network (everything above except `localhost`) requires the **ACCESS_LOCAL_NETWORK** permission. Colota requests this when you use **Test Connection**. See [Permissions](/docs/development/permissions#local-network-access) for details.

Use the **Test Connection** button in settings to verify your server is reachable.

## Sync Modes

- **Instant (0s)**: Each location is sent immediately after recording
- **Batch (1 min, 5 min, 15 min, or Custom)**: Locations are queued and sent in batches at the configured interval
- **Offline**: No network activity - data is stored locally only. See [Offline Mode](#offline-mode) below.

## Offline Mode

Enable **Offline Mode** in Settings to use Colota as a standalone tracker without any server. Locations are recorded and stored locally on-device.

### Enabling Offline Mode

When you toggle offline mode on with unsent locations still in the queue, a dialog offers several options:

- **Sync First** - attempt to upload queued locations before switching (only available if an endpoint is configured)
- **Keep in Queue** - preserve queued locations for later sync when you disable offline mode
- **Delete Queue** - permanently delete all pending locations
- **Cancel** - abort and stay in online mode

If no locations are queued, offline mode enables immediately.

### What Changes in Offline Mode

The UI simplifies to remove sync-related elements that don't apply:

**Hidden in offline mode:**

- Server Endpoint and Test Connection
- Authentication & Headers
- API Field Mapping
- Sync Interval, Retry Failed Uploads, Wi-Fi Only Sync
- Queue statistics (Queued / Sent counts)
- Queue actions (Sync Now, Clear Sent History, Clear Queue)
- Queue info in the tracking notification

**Still available in offline mode:**

- All tracking parameters (interval, movement threshold, accuracy)
- Tracking profiles and geofences
- Data export (CSV, GeoJSON, GPX, KML) - both manual and auto-export
- Database statistics (Total locations, Today count, Storage)
- Data cleanup (Delete All Locations, Delete Old, Optimize Database)

### Disabling Offline Mode

Toggle offline mode off in Settings to return to online mode. If you had an endpoint configured before, syncing resumes with your previous settings. Any locations that were kept in the queue will be sent on the next sync cycle.

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
