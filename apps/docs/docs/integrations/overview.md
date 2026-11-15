---
sidebar_position: 1
---

# Choosing a Backend

Colota sends location data to a server you control. Pick your backend below, then select its template in **Settings → Connection → Request format**. [Request format](/docs/configuration/request-format#backend-templates) lists what each template sets.

## Available Backends

| Backend                                                  | Template to select                         |
| -------------------------------------------------------- | ------------------------------------------ |
| [Dawarich](dawarich.md)                                  | Dawarich                                   |
| [GeoPulse](geopulse.md)                                  | GeoPulse                                   |
| [Home Assistant](home-assistant.md)                      | Custom (the default)                       |
| [Overland](overland.md) - any Overland-compatible server | Overland                                   |
| [OwnTracks](owntracks.md)                                | OwnTracks                                  |
| [PhoneTrack](phonetrack.md)                              | OwnTracks, with PhoneTrack's OwnTracks URL |
| [Reitti](reitti.md)                                      | Reitti                                     |
| [Traccar](traccar.md)                                    | Traccar                                    |
| [Custom Backend](custom-backend.md)                      | Custom                                     |

## No backend needed

Colota works fully offline without any server. Locations are stored on-device and can be exported as CSV, GeoJSON, GPX, or KML at any time.
