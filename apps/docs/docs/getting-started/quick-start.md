---
sidebar_position: 2
---

# Quick Start

Minimal setup to start tracking:

1. Install the app ([Google Play](https://play.google.com/store/apps/details?id=com.Colota&hl=en-US), [F-Droid](https://f-droid.org/packages/com.Colota/), [IzzyOnDroid](https://apt.izzysoft.de/packages/com.Colota/) or [APK](https://github.com/dietrichmax/colota/releases))
2. Grant location permissions - select **Precise location** and **Allow all the time**
3. Grant notification permission - optional. On Android 13 and later, refusing it hides the tracking status notification
4. Disable battery optimization for Colota in Android settings (otherwise background tracking won't work reliably)
5. Press **Start Tracking**
6. Watch the Dashboard map follow your position and draw today's track

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Dashboard.png", label: "Dashboard" }, ]} />

The app works completely offline. Server setup is optional.

## Next Steps

- [Adjust Tracking & sync](/docs/configuration/tracking-sync) to change how often Colota records and syncs
- [Set up a server](/docs/configuration/connection) to sync location data
- [Create geofences](/docs/guides/geofencing) to save battery at home or work
- [Battery optimization tips](/docs/guides/battery-optimization) to reduce power usage
