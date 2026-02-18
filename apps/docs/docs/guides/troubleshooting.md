---
sidebar_position: 4
---

# Troubleshooting

## App doesn't track in background

- Go to **Settings > Apps > Colota > Battery** and select **Unrestricted**
- Verify location permissions are set to **Allow all the time**
- Ensure the foreground notification is visible

## GPS accuracy is poor

- Wait for GPS lock (can take 30-60 seconds)
- Move to an open area away from buildings
- Check if **High Accuracy** is enabled in device location settings
- Enable **Filter Inaccurate Locations** in app settings

## Server sync not working

1. Check endpoint URL format - must be `https://` or `http://localhost`
2. Use the **Test Connection** button in settings
3. Check server logs for incoming requests
4. Verify network connectivity
5. Check the queue count in **Data Management**

**Common causes**: Wrong URL, HTTPS required for non-localhost, expired SSL certificate, incorrect authentication, mismatched field mapping, self-signed certificate (not supported), **Wi-Fi Only Sync** enabled while on cellular data.

## Debugging with adb logcat

Filter logs to see what Colota is doing:

```bash
adb logcat | grep -E "LocationDB|NetworkManager|SyncManager|LocationService|GeofenceHelper"
```

Key log tags:

| Tag               | What it shows                      |
| ----------------- | ---------------------------------- |
| `LocationService` | GPS fixes, service lifecycle       |
| `SyncManager`     | Queue processing, retry attempts   |
| `NetworkManager`  | HTTP requests, endpoint validation |
| `LocationDB`      | Database operations                |
| `GeofenceHelper`  | Zone detection                     |

You can also use the **Location History** screen in the app to see recorded locations on a track map or as a list with their accuracy and timestamps.

## Locations not syncing on mobile data

If **Wi-Fi Only Sync** is enabled, uploads are skipped while on cellular data. Locations continue to be recorded and queued locally - they sync automatically when you connect to Wi-Fi.

To disable: **Settings > Advanced Settings > Network Settings > Wi-Fi Only Sync**.

## Database growing too large

- Use **Clear Sent History** to remove synced locations
- Use **Delete Older Than X Days** for cleanup
- Export data first if you want to keep it
- Use **Vacuum Database** to reclaim space after deletions

**Size reference**: ~200 bytes per location, ~2 MB per 10,000 locations.
