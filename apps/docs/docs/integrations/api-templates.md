---
sidebar_position: 1
---

# API Templates

Colota includes built-in templates for popular backends. Select a template in **Settings > API Settings** to auto-configure field mappings and custom fields.

| Template       | HTTP Method | Bearing Field | Custom Fields                    | Notes                             |
| -------------- | ----------- | ------------- | -------------------------------- | --------------------------------- |
| **Dawarich**   | POST        | `cog`         | `_type: "location"`              | OwnTracks-compatible format       |
| **OwnTracks**  | POST        | `cog`         | `_type: "location"`, `tid: "AA"` | Standard OwnTracks HTTP format    |
| **PhoneTrack** | POST        | `bearing`     | `_type: "location"`              | Nextcloud PhoneTrack format       |
| **Reitti**     | POST        | `bear`        | `_type: "location"`              | Standard field names              |
| **Traccar**    | GET         | `bearing`     | `id: "colota"`                   | OsmAnd protocol with query params |
| **Custom**     | POST        | `bear`        | _(none)_                         | Fully user-defined                |

All templates share the same base fields (`lat`, `lon`, `acc`, `alt`, `vel`, `batt`, `bs`, `tst`) with different field names. Key differences are the HTTP method, bearing field name, and auto-included custom fields.

When you select a template, field mapping, custom fields, and HTTP method are automatically configured. You can still customize individual fields or switch the HTTP method after applying a template — doing so switches the template to "Custom".
