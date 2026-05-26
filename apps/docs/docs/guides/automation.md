---
sidebar_position: 3
---

# Automation

Trigger Colota from outside the app - useful for hands-free workflows like starting tracking when your phone connects to car Bluetooth.

## App Shortcuts

Long-press the Colota icon on your home screen to access shortcuts for starting and stopping tracking without opening the app.

### Available shortcuts

| Shortcut           | Action                                                |
| ------------------ | ----------------------------------------------------- |
| **Start Tracking** | Starts the tracking service using your saved settings |
| **Stop Tracking**  | Stops the tracking service                            |

### Requirements

Shortcuts use your saved settings directly - no UI interaction needed. Before using shortcuts, make sure you have:

- Granted location permissions (fine + background)
- Exempted Colota from battery optimization
- Configured an endpoint (if syncing to a server)

If permissions have not been granted, the start shortcut will not work. Open the app first to complete setup.

### Use with Tasker & Samsung Routines

Shortcuts can be triggered by automation apps, making hands-free tracking possible while driving.

**Samsung Routines** (One UI):

1. Open the **Routines** app
2. Create a new routine
3. Add a trigger (e.g. connected to car Bluetooth)
4. Add action → **App shortcuts** → select Colota → **Start Tracking**

**Tasker** (shortcut route):

1. Create a new Task
2. Add action → **App** → **Shortcut**
3. Select the Colota start or stop shortcut

## Broadcast Intents

A more direct path for power users: Colota exposes start and stop as Android broadcast intents that any automation app, script or hardware-button app can fire.

### Available actions

| Action                             | Effect                                                |
| ---------------------------------- | ----------------------------------------------------- |
| `com.Colota.action.START_TRACKING` | Starts the tracking service using your saved settings |
| `com.Colota.action.STOP_TRACKING`  | Stops the tracking service                            |

Action strings are **case-sensitive**. `com.Colota` with a capital **C** is correct - the lowercase form (`com.colota`) is silently ignored.

A short toast confirms each action.

### Tasker (Send Intent route)

1. Create a new Task
2. Add action → **System** → **Send Intent**
3. Set **Action** to `com.Colota.action.START_TRACKING` (or `STOP_TRACKING`)
4. Set **Target** to **Broadcast Receiver**
5. Set **Package** to `com.Colota`

### Security note

These broadcasts are exported with no permission gate, so any app installed on your device can fire them. Effects are limited to starting or stopping tracking with your existing settings - data still only flows to the endpoint you configured.
