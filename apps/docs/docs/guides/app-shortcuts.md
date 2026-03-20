---
sidebar_position: 3
---

# App Shortcuts

Long-press the Colota icon on your home screen to access shortcuts for starting and stopping tracking without opening the app.

## Available Shortcuts

| Shortcut           | Action                                                |
| ------------------ | ----------------------------------------------------- |
| **Start Tracking** | Starts the tracking service using your saved settings |
| **Stop Tracking**  | Stops the tracking service                            |

## Requirements

Shortcuts use your saved settings directly - no UI interaction needed. Before using shortcuts, make sure you have:

- Granted location permissions (fine + background)
- Exempted Colota from battery optimization
- Configured an endpoint (if syncing to a server)

If permissions have not been granted, the start shortcut will not work. Open the app first to complete setup.

## Automations

Shortcuts can be triggered by automation apps, making hands-free tracking possible while driving.

**Samsung Routines** (One UI):

1. Open the **Routines** app
2. Create a new routine
3. Add a trigger (e.g. connected to car Bluetooth)
4. Add action → **App shortcuts** → select Colota → **Start Tracking**

**Tasker**:

1. Create a new Task
2. Add action → **App** → **Shortcut**
3. Select the Colota start or stop shortcut
