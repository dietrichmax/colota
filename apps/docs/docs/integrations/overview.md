---
sidebar_position: 1
---

# Choosing a Backend

Colota sends location data to a server you control. If you're not sure which backend to use, this page gives a quick comparison.

## Comparison

| Backend                             | Best for                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------- |
| [Dawarich](dawarich.md)             | Location history, map visualization, stats and trip analysis                |
| [GeoPulse](geopulse.md)             | Location tracking with trip visualization and timeline                      |
| [Overland](overland.md)             | Any Overland-compatible server                                              |
| [Home Assistant](home-assistant.md) | Home automation - use location as a trigger for automations and zones       |
| [OwnTracks](owntracks.md)           | Self-hosted location history using the OwnTracks Recorder                   |
| [Reitti](reitti.md)                 | Location history with automatic visit and trip detection and daily timeline |
| [PhoneTrack](phonetrack.md)         | Track devices from within an existing Nextcloud install                     |
| [Traccar](traccar.md)               | Real-time GPS tracking platform for multiple devices and fleet management   |
| [Custom Backend](custom-backend.md) | Any HTTP endpoint - configure field names and format to match your API      |

## Quick decision guide

- **I want to visualize my location history with maps and stats** - use [Dawarich](dawarich.md) or [GeoPulse](geopulse.md)
- **I use Home Assistant for home automation** - use [Home Assistant](home-assistant.md)
- **I already run Nextcloud** - use [PhoneTrack](phonetrack.md)
- **I need to track multiple devices** - use [Traccar](traccar.md)
- **I want to send to my own API** - use [Custom Backend](custom-backend.md)
- **I want to send to multiple backends at once** - point Colota at [colota-forwarder](https://github.com/dietrichmax/colota-forwarder) and configure each target there

## No backend needed

Colota works fully offline without any server. Locations are stored on-device and can be exported as CSV, GeoJSON, GPX, or KML at any time.
