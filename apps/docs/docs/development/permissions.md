---
sidebar_position: 3
---

# Android Permissions

These are the permissions Colota uses and why. None are related to analytics, advertising, or data collection.

## Permission Overview

| Permission                     | Required    | Why                                               |
| ------------------------------ | ----------- | ------------------------------------------------- |
| Fine Location                  | Yes         | GPS-based location tracking                       |
| Coarse Location                | Yes         | Network-based location fallback                   |
| Background Location            | Yes         | Track while app is in the background              |
| Foreground Service             | Yes         | Required by Android for background services       |
| Internet                       | Yes         | Send locations to your server                     |
| Network State                  | Yes         | Check connectivity before syncing                 |
| Boot Completed                 | Yes         | Auto-restart tracking after device reboot         |
| Notifications                  | Android 13+ | Display the foreground service notification       |
| Battery Optimization Exemption | Optional    | Prevent Android from killing the tracking service |

## Permission Request Flow

When you start tracking for the first time, Colota requests permissions in sequence:

1. **Fine Location** - Required to access GPS hardware
2. **Background Location** (Android 10+) - Appears as a separate dialog asking to "Allow all the time"
3. **Notification Permission** (Android 13+) - Required for the foreground service notification
4. **Battery Optimization Exemption** - Optional dialog to prevent the system from restricting the app

If any required permission is denied, tracking cannot start. The app does not request permissions until you explicitly tap "Start Tracking".

## Detailed Explanations

### Location Permissions

```
android.permission.ACCESS_FINE_LOCATION
android.permission.ACCESS_COARSE_LOCATION
android.permission.ACCESS_BACKGROUND_LOCATION
```

**Fine Location** provides GPS-level accuracy (typically 3-10 meters). **Coarse Location** is declared as a fallback but fine location is always preferred. **Background Location** allows the foreground service to continue receiving GPS updates when the app is not in the foreground.

### Foreground Service

```
android.permission.FOREGROUND_SERVICE
android.permission.FOREGROUND_SERVICE_LOCATION
```

Android requires apps to declare a foreground service with a persistent notification to run in the background. The `FOREGROUND_SERVICE_LOCATION` type specifically indicates the service accesses location data. This is what keeps the "Colota is tracking" notification visible.

### Network

```
android.permission.INTERNET
android.permission.ACCESS_NETWORK_STATE
```

**Internet** is needed to POST location data to your configured server endpoint. **Network State** lets the app check for connectivity before attempting to sync, avoiding unnecessary failures.

### Boot Completed

```
android.permission.RECEIVE_BOOT_COMPLETED
```

If tracking was active when the device was powered off, Colota automatically restarts the foreground service after boot. This is handled by `LocationBootReceiver`.

### Notifications

```
android.permission.POST_NOTIFICATIONS
```

Starting with Android 13, apps must request notification permission explicitly. Colota needs this for the foreground service notification. If denied, the service may still run but with reduced reliability depending on the Android version.

### Battery Optimization

```
android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
```

This allows Colota to show the system dialog asking to exempt the app from battery optimization (Doze mode). When exempted, Android is less likely to kill the tracking service during idle periods. This is optional - tracking works without it, but may be less reliable on some devices.

## Revoking Permissions

You can revoke any permission at any time through Android Settings → Apps → Colota → Permissions. Revoking location permissions will stop tracking. Other permissions can be toggled without affecting the core tracking functionality.
