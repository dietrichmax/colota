---
sidebar_position: 4
---

# Troubleshooting

## App doesn't track in background

- Go to **Settings > Apps > Colota > Battery** and select **Unrestricted**
- Verify location permissions are set to **Allow all the time**
- Ensure notification permission is granted - Colota uses a foreground service which requires a persistent notification. Without it, the service cannot start.

## Tracking doesn't start after reboot

- Make sure tracking was active before the reboot
- Notification permission must be granted - without it the foreground service cannot start on boot
- Disable battery optimization for Colota (**Settings > Apps > Colota > Battery > Unrestricted**)
- **Samsung**: Make sure "Pause app activity if unused" is turned off for Colota (**Settings > Apps > Colota > Battery**)

## GPS accuracy is poor

- Wait for GPS lock (can take 30-60 seconds)
- Move to an open area away from buildings
- Check if **High Accuracy** is enabled in device location settings
- Enable **Filter Inaccurate Locations** in app settings

## Server sync not working

1. Check endpoint URL format - must be `https://` for public endpoints, or `http://` for private/local addresses
2. Use the **Test Connection** button in settings
3. Check server logs for incoming requests
4. Verify network connectivity
5. Check the queue count in **Data Management**

**Common causes**: Wrong URL, HTTPS required for public endpoints, expired SSL certificate, incorrect authentication, mismatched field mapping, self-signed certificate (install your CA via Settings → Security → Encryption & credentials), **Sync Condition** restricting uploads to a specific network (Wi-Fi, SSID or VPN), missing local network permission on Android 16+.

## Exporting app logs

You can view and export app logs directly from the device for bug reports:

1. Go to **Settings > Activity Log**
2. Browse logs in the viewer - filter by level or search for keywords
3. Tap the share button to export a text file with all log entries
4. The export includes app version, device info and all collected log messages

Logs are always collected in the background using a fixed-size ring buffer.

## Debugging with adb logcat

Filter logs to see what Colota is doing:

```bash
adb logcat | grep -E "LocationDB|NetworkManager|SyncManager|LocationService|GeofenceHelper"
```

Key log tags:

| Tag                | What it shows                      |
| ------------------ | ---------------------------------- |
| `LocationService`  | GPS fixes, service lifecycle       |
| `SyncManager`      | Queue processing, retry attempts   |
| `NetworkManager`   | HTTP requests, endpoint validation |
| `LocationDB`       | Database operations                |
| `GeofenceHelper`   | Zone detection                     |
| `AutoExportWorker` | Scheduled export execution         |

You can also use the **Location History** screen in the app to see recorded locations on a track map or as a list with their accuracy and timestamps.

## Local server not reachable (Android 16+)

Starting with Android 17, connecting to local/private network addresses requires the **Local Network Access** permission. Colota requests this automatically when you test a local endpoint.

On some Android 16 devices, this may already be enforced via security patches using the **Nearby Wi-Fi Devices** permission instead.

If sync to a local server stopped working after an Android update:

1. Go to **Android Settings > Apps > Colota > Permissions**
2. On Android 17+: Grant the **Local network access** permission
3. On Android 16: Grant the **Nearby devices** permission
4. Use the **Test Connection** button to verify

If you denied the permission and the system no longer shows the dialog, reset it from Android Settings.

## Locations not syncing on certain networks

If **Sync Only On** is set to Wi-Fi, a specific SSID or VPN, uploads are skipped when the condition is not met. Locations continue to be recorded and queued locally - they sync automatically when the condition is satisfied.

To change: **Settings > Advanced Settings > Network Settings > Sync Only On**.

## Auto-export not working

- Verify a directory is selected in **Settings > Auto-Export**
- Check that the toggle is enabled
- The first export fires at the configured time, not on enable. Tap **Export Now** to confirm the pipeline works without waiting
- Doze mode can delay an alarm by up to ~15 minutes - if exports are running but a few minutes late, that's expected
- If you see a "Directory permission lost" notification, re-select the export directory
- Check that the selected directory still exists and is accessible
- Transient errors (I/O failures) retry up to 3 times automatically; permanent errors (invalid config, directory issues) fail immediately without retrying
- If old exports seem to disappear, check the **File Retention** setting - by default only the last 10 files are kept
- Check the `Colota.AutoExportAlarm`, `Colota.AutoExportScheduler` and `Colota.AutoExportWorker` log tags in native logs for details

## Database growing too large

- Use **Clear Sent History** to remove synced locations
- Use **Delete Older Than X Days** for cleanup
- Export data first if you want to keep it
- Use **Vacuum Database** to reclaim space after deletions

**Size reference**: ~200 bytes per location, ~2 MB per 10,000 locations.
