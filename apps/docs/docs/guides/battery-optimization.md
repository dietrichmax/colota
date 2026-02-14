---
sidebar_position: 3
---

# Battery Optimization

Settings and tips to reduce battery usage without losing GPS fixes.

## Built-in Optimizations

- **Notification throttling**: Max 1 update per 10 seconds, plus 2-meter movement filter
- **Batch processing**: 50 items per batch, 10 concurrent network requests
- **Smart sync**: Only syncs when queue has items and network is available
- **Battery critical shutdown**: Stops tracking below 5% (when unplugged)

## Tips

1. **Increase GPS interval** -- 5s to 30s saves significant battery
2. **Enable accuracy filtering** -- Reject poor GPS fixes to avoid unnecessary processing
3. **Use batch sync** instead of instant -- Reduces network usage and wake-ups
4. **Create geofences** for home/work -- GPS stops completely in zones
5. **Enable movement threshold** -- 10--50m, skip stationary updates
6. **Disable battery optimization** for Colota in Android settings to prevent the OS from killing the service

## Android Battery Settings

For reliable background tracking, configure Android to not restrict Colota:

1. Go to **Android Settings > Apps > Colota > Battery**
2. Select **Unrestricted**
3. This prevents Android from killing the foreground service
