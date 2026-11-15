---
title: "Request format"
aliases:
  - /docs/configuration/field-mapping/
  - /docs/integrations/api-templates/
---

Found under **Settings → Connection → Request format**. It shapes every request: the backend template, the HTTP method, the field names and any custom fields.

{{< screenshots "ApiFieldMapping|Request format" "BackendTemplates|Backend template" >}}

## Backend Templates

Colota includes built-in templates for popular backends. Select a template in **Settings → Connection → Request format** to auto-configure field mappings and custom fields.

| Template | HTTP method | Bearing Field | Custom fields | Notes |
| --- | --- | --- | --- | --- |
| **Dawarich** | POST | `cog` | `_type: "location"` | OwnTracks single-point format. Optional Batch chip switches to Overland envelope (see [Dawarich integration](/docs/integrations/dawarich)). |
| **GeoPulse** | POST | `bear` | _(none)_ | Native Colota format |
| **Overland** | POST | n/a (uses Overland format) | `device_id: "colota"` | Batch-only Overland GeoJSON envelope. For any backend that accepts the Overland format (Compass, Wayfinder, Dawarich, etc). |
| **OwnTracks** | POST | `cog` | `_type: "location"`, `tid: "AA"` | Standard OwnTracks HTTP format |
| **PhoneTrack** | POST | `bearing` | `useragent: "Colota"` | Nextcloud PhoneTrack format |
| **Reitti** | POST | `bear` | `_type: "location"` | Standard field names |
| **Traccar** | GET or POST | `bearing` | `id: "colota"` | GET: OsmAnd query params, POST: Traccar JSON |
| **Custom** | POST | `bear` | _(none)_ | Fully user-defined |

All templates share the same base fields (`lat`, `lon`, `acc`, `alt`, `vel`, `batt`, `bs`, `tst`) with different field names. Key differences are the HTTP method, bearing field name, and auto-included custom fields.

When you select a template, field mapping, custom fields, and HTTP method are automatically configured. You can still customize individual fields or switch the HTTP method after applying a template.

## HTTP Method

**POST** sends the location as a JSON body and **GET** sends it as query parameters. The default is POST. The Overland template is POST only and hides the option.

## Default Fields

Customize field names sent to your server. Field names apply to both POST (JSON body) and GET (query parameters) requests.

| Field  | Description                                                | Required                    |
| ------ | ---------------------------------------------------------- | --------------------------- |
| `lat`  | Latitude (Double)                                          | Yes                         |
| `lon`  | Longitude (Double)                                         | Yes                         |
| `acc`  | Accuracy in meters (Integer, rounded)                      | Yes                         |
| `alt`  | Altitude in meters (Integer, rounded)                      | Only if device has altitude |
| `vel`  | Speed in m/s (Double, 1 decimal)                           | Only if device has speed    |
| `batt` | Battery level 0–100 (Integer)                              | Yes                         |
| `bs`   | Battery status: 0=unknown, 1=unplugged, 2=charging, 3=full | Yes                         |
| `tst`  | Timestamp in Unix seconds (Long, not milliseconds)         | Yes                         |
| `bear` | Bearing in degrees 0–360 (Double)                          | Only if device has bearing  |

## Custom Mapping

You can rename any field to match your backend. For example:

```json
// Default mapping
{
  "lat": 48.1351,
  "lon": 11.5820,
  "acc": 12
}

// Custom mapping
{
  "latitude": 48.1351,
  "longitude": 11.5820,
  "accuracy_m": 12,
  "timestamp_unix": 1704067200
}
```

Configure field names in **Settings → Connection → Request format → Field mappings**.

## Custom Static Fields

Add arbitrary key-value pairs that are included in every API payload. For example, adding `_type: "location"` for OwnTracks-compatible backends.

Configure in **Settings → Connection → Request format → Custom fields**.

## Current Geofences

Turn on **Send current geofences** to add `inregions` to every point: the names of the enabled geofences the point is in. The field keeps its name whatever the mapping says. It needs the POST method or an Overland batch, so the switch is unavailable for GET and the Traccar JSON format.

Configure in **Settings → Connection → Request format → Geofences**.

See [API Reference](/docs/api-reference#geofences) for the format.

## Enter and Leave Events

Turn on **Send enter and leave events** to send an event each time you enter or leave a geofence: an OwnTracks transition of its own, or for an Overland batch a request with the events in `transitions`. It has the same limits as current geofences.

Configure in **Settings → Connection → Request format → Geofences**.

See [API Reference](/docs/api-reference#enter-and-leave-events) for the format.

**Note:** Custom field values are always sent as strings. Custom fields are added to the payload before location fields - if a custom field key matches a location field key, the location field takes precedence.
