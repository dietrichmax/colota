---
sidebar_position: 1
---

# API Templates

Colota includes built-in templates for popular backends. Select a template in **Settings > API Settings** to auto-configure field mappings and custom fields.

| Template      | Bearing Field | Custom Fields                    | Notes                          |
| ------------- | ------------- | -------------------------------- | ------------------------------ |
| **Dawarich**  | `cog`         | `_type: "location"`              | OwnTracks-compatible format    |
| **OwnTracks** | `cog`         | `_type: "location"`, `tid: "AA"` | Standard OwnTracks HTTP format |
| **Reitti**    | `bear`        | `_type: "location"`              | Standard field names           |
| **Custom**    | `bear`        | _(none)_                         | Fully user-defined             |

All templates share the same base fields: `lat`, `lon`, `acc`, `alt`, `vel`, `batt`, `bs`, `tst`. The key differences are the bearing field name and auto-included custom fields.

When you select a template, field mapping and custom fields are automatically configured. You can still customize individual fields after applying a template.
