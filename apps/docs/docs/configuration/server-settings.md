---
sidebar_position: 3
---

# Server Settings

| Setting        | Description                         | Default         | Range        |
| -------------- | ----------------------------------- | --------------- | ------------ |
| Endpoint       | HTTPS URL of your server            | Empty (offline) | --           |
| Sync Interval  | Batch mode interval                 | Instant (0)     | 0s -- 60min  |
| Retry Interval | Time between retry attempts         | 30 seconds      | 30s -- 15min |
| Max Retries    | Maximum retry attempts per location | 5               | 3, 5, 10, ∞  |
| Offline Mode   | Disable all network activity        | Disabled        | On/Off       |

## Endpoint URL

Your server endpoint must accept HTTPS POST requests. HTTP is only allowed for private/local addresses:

- `127.0.0.1` / `localhost`
- `192.168.x.x`
- `10.x.x.x`
- `172.16--31.x.x`

Use the **Test Connection** button in settings to verify your server is reachable.

## Sync Modes

- **Instant (0s)**: Each location is sent immediately after recording
- **Batch (1--60 min)**: Locations are queued and sent in batches at the configured interval
- **Offline**: No network activity -- data is stored locally only

## Retry Behavior

When a sync attempt fails, Colota retries with exponential backoff:

```
Attempt 1: Immediate
Attempt 2: +30s
Attempt 3: +60s (1 minute)
Attempt 4: +300s (5 minutes)
Attempt 5+: +900s (15 minutes)
```

After max retries (default: 5), failed items are automatically removed from the queue. The app also auto-syncs when network connectivity is restored.
