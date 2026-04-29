---
sidebar_position: 2
---

# Quick Start

Minimal setup to start tracking:

1. Install the app ([Google Play](https://play.google.com/store/apps/details?id=com.Colota&hl=en-US), [F-Droid](https://f-droid.org/packages/com.Colota/), [IzzyOnDroid](https://apt.izzysoft.de/packages/com.Colota/) or [APK](https://github.com/dietrichmax/colota/releases))
2. Grant location permissions - select **Precise location** and **Allow all the time**
3. Grant notification permission - required for the foreground service that keeps GPS tracking alive
4. Disable battery optimization for Colota in Android settings (otherwise background tracking won't work reliably)
5. Press **Start Tracking**
6. View live coordinates on the dashboard

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Dashboard.png", label: "Dashboard" }, ]} />

The app works completely offline. Server setup is optional.

## Next Steps

- [Configure GPS settings](/docs/configuration/gps-settings) to adjust tracking intervals
- [Set up a server](/docs/configuration/server-settings) to sync location data
- [Create geofences](/docs/guides/geofencing) to save battery at home or work
- [Battery optimization tips](/docs/guides/battery-optimization) to reduce power usage
