---
sidebar_position: 2
---

# Alternatives

Colota is one of several Android apps that can record and forward GPS location data. This page gives an honest overview of the options so you can pick the right tool.

## Comparison

|                                        | Colota | OwnTracks | GPSLogger | Traccar Client | μLogger |
| -------------------------------------- | :----: | :-------: | :-------: | :------------: | :-----: |
| In-app location history & trip view    |   ✓    |     –     |     –     |       –        |    –    |
| File export (GPX, KML, CSV…)           |   ✓    |     –     |     ✓     |       –        |    ✓    |
| Scheduled auto-export                  |   ✓    |     –     |     –     |       –        |    –    |
| Waypoints / notes                      |   –    |     –     |     ✓     |       –        |    ✓    |
| Geofencing (pause zones)               |   ✓    |     –     |     –     |       –        |    –    |
| Automatic condition-based profiles     |   ✓    |     –     |     –     |       –        |    –    |
| Offline maps                           |   ✓    |     –     |     –     |       –        |    –    |
| Built-in server integrations           |   ✓    |     –     |     –     |       –        |    –    |
| MQTT support                           |   –    |     ✓     |     –     |       –        |    –    |
| FOSS variant (no Google Play Services) |   ✓    |     ✓     |     ✓     |       –        |    ✓    |
| iOS app available                      |   –    |     ✓     |     –     |       ✓        |    –    |

## When to use each

**Colota** is a good fit if you want a self-hosted tracking app with location history, geofencing, and backend flexibility - and you want to see and manage your data inside the app itself.

**[OwnTracks](https://owntracks.org)** is a better fit if you need MQTT support. It has both Android and iOS clients, making it the natural choice for mixed-platform households.

**[GPSLogger](https://gpslogger.app)** is a better fit if your goal is a GPX, KML, or CSV file rather than a live server sync - for hiking, geotagging photos, or recording routes. It can also upload directly to Dropbox, Google Drive, FTP, and OpenStreetMap.

**[Traccar Client](https://www.traccar.org/client/)** is a better fit if you exclusively use Traccar and want the simplest possible client with no extra features.

**[μLogger](https://github.com/bfabiszewski/ulogger-android)** is a better fit if you want a lightweight logger with waypoint support (photos and notes attached to locations) and you self-host the matching [uLogger server](https://github.com/bfabiszewski/ulogger-server).
