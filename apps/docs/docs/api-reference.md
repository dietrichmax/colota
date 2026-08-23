---
sidebar_position: 6
---

# API Reference

Reference for the HTTP requests Colota sends to your server.

## Request

**Method:** `POST` (default) or `GET`

Configure the HTTP method in **Settings > API Settings > HTTP Method**.

### POST (default)

**Headers:**

```
Content-Type: application/json; charset=UTF-8
Accept: application/json
```

Additional headers may be included based on your [authentication](/docs/configuration/authentication) configuration.

**Body:**

This is the body for the default field-mapped format. The Traccar POST and Overland templates and
Dawarich in batch mode, send a different shape entirely. Those formats use fixed field names, so the
[field mapping](/docs/configuration/field-mapping) does not apply to them and both add a `device_id`
key. See [API templates](/docs/integrations/api-templates) for the exact bodies.

```json
{
  "lat": 48.135124,
  "lon": 11.581981,
  "acc": 12,
  "alt": 519,
  "vel": 0,
  "batt": 85,
  "bs": 2,
  "tst": 1704067200,
  "bear": 180.5
}
```

### GET

Fields are sent as URL query parameters instead of a JSON body. No `Content-Type` header is set. Authentication headers are still included if configured.

```
GET https://your-server.com:5055/?id=colota&lat=48.135124&lon=11.581981&accuracy=12&altitude=519&speed=0&batt=85&charge=2&timestamp=1704067200&bearing=180.5
```

Values are URL-encoded. If the endpoint URL already contains query parameters, additional parameters are appended with `&`.

All field names are [customizable](/docs/configuration/field-mapping).

### Field Types

| Field  | Type    | Unit                                       | Always present                        |
| ------ | ------- | ------------------------------------------ | ------------------------------------- |
| `lat`  | Double  | Degrees                                    | Yes                                   |
| `lon`  | Double  | Degrees                                    | Yes                                   |
| `acc`  | Integer | Meters (rounded)                           | Yes                                   |
| `alt`  | Integer | Meters (rounded)                           | No - only if device has altitude data |
| `vel`  | Double  | m/s (1 decimal)                            | No - only if device has speed data    |
| `batt` | Integer | Percent (0–100)                            | Yes                                   |
| `bs`   | Integer | 0=unknown, 1=unplugged, 2=charging, 3=full | Yes                                   |
| `tst`  | Long    | Unix seconds (not milliseconds)            | Yes                                   |
| `bear` | Double  | Degrees (0–360)                            | No - only if device has bearing data  |

**Important:** `alt`, `vel`, and `bear` are conditionally included. Your server should not reject payloads missing these fields.

### Anchor Points

When exiting a [pause zone](/docs/guides/geofencing#anchor-points), Colota sends a synthetic location at the geofence center. These payloads look like regular locations but have specific characteristics:

- `lat`/`lon` are the geofence center coordinates (not the actual GPS position)
- `acc` is 0, so the point passes any downstream quality filter and is recognisable as synthetic
- `tst` is set to 1 second before the first real GPS fix after leaving the zone
- `alt`, `vel`, and `bear` are not included
- `batt` and `bs` reflect the current battery state

A zone [heartbeat](/docs/guides/geofencing) produces the same kind of synthetic point while you are
still inside the zone: the zone centre, `acc` 0, timestamped when the heartbeat fired. Filter on both
if you want to tell app-generated points from real fixes.

### Custom Fields

Custom static fields (configured in API Settings) are added to the payload first, then location fields are added. If a custom field has the same name as a location field, the location field overwrites it.

Custom field values are always sent as strings.

## Batch Sync Behavior

In the default field-mapped format Colota sends **one location per HTTP request**. During batch sync
up to 10 requests are sent concurrently, processing up to 500 queued locations per sync cycle.

The Overland format, and Dawarich in batch mode, instead send **an array of locations in a single
request**. Batch size is configurable (1 to 500, default 50) and up to 10 batches are sent per cycle,
so one cycle can move considerably more than 500 points.

Your server should handle multiple simultaneous POST requests. If you have rate limiting, some requests may fail and be retried.

## Testing with curl

**POST (default):**

```bash
curl -X POST https://your-server.com/api/location \
  -H "Content-Type: application/json; charset=UTF-8" \
  -H "Accept: application/json" \
  -d '{"lat":48.135,"lon":11.582,"acc":12,"vel":0,"batt":85,"bs":2,"tst":1704067200}'
```

**GET (e.g., Traccar):**

```bash
curl "https://your-server.com:5055/?id=colota&lat=48.135&lon=11.582&accuracy=12&speed=0&batt=85&timestamp=1704067200"
```

**With Basic Auth:**

```bash
curl -X POST https://your-server.com/api/location \
  -H "Content-Type: application/json; charset=UTF-8" \
  -H "Authorization: Basic dXNlcjpwYXNz" \
  -d '{"lat":48.135,"lon":11.582,"acc":12,"vel":0,"batt":85,"bs":2,"tst":1704067200}'
```

## Response

**Success:**

```
Status: 200–299
Body: Any (ignored by Colota)
```

Your server only needs to return a 2xx status code. The response body is not read.

## Error Handling

| Error Type               | Behavior                                   |
| ------------------------ | ------------------------------------------ |
| **Any non-2xx response** | Queued for retry                           |
| **Network timeout**      | Retried (10s connection, 10s read timeout) |

There is no distinction between 4xx and 5xx in retry behavior - all failures are retried indefinitely,
and failed items stay in the queue until they succeed.

Clearing the queue in **Settings > Data Management** deletes those locations outright, not just their
place in the queue, so anything not yet sent is lost.

## Retry Strategy

When consecutive sync attempts fail, Colota uses exponential backoff:

```
Attempt 1: Immediate
Attempt 2: +30s delay
Attempt 3: +60s delay (1 minute)
Attempt 4: +300s delay (5 minutes)
Attempt 5+: +900s delay (15 minutes)
```

Failed items stay in the queue indefinitely until they succeed. The queue can be cleared manually in Settings > Data Management if needed.

## Network Requirements

- **HTTPS required** for all public endpoints
- **HTTP allowed** for private/local addresses - enforced via DNS resolution at both sync time and Test Connection
- Non-standard ports are supported (e.g., `https://my-server.com:8443/api`)
- Self-signed certificates are supported - see [Server Settings](/docs/configuration/server-settings#endpoint-url) for setup instructions

## Connectivity Check

Colota checks Android's network connectivity manager before attempting sync. This check is cached for 5 seconds. When offline, locations are queued locally and synced automatically when the network returns.
