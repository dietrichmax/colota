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

### Custom Fields

Custom static fields (configured in API Settings) are added to the payload first, then location fields are added. If a custom field has the same name as a location field, the location field overwrites it.

Custom field values are always sent as strings.

## Batch Sync Behavior

Colota sends **one location per HTTP request** - not an array. During batch sync, up to 10 requests are sent concurrently, processing up to 500 queued locations per sync cycle.

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

| Error Type | Behavior |
| --- | --- |
| **Any non-2xx response** | Queued for retry with exponential backoff |
| **Network timeout** | Retried with backoff (10s connection, 10s read timeout) |
| **Max retries exceeded** | Item permanently deleted from queue (location data remains in the database and can still be exported). Enable "Retry Failed Uploads" to retry indefinitely instead. |

There is no distinction between 4xx and 5xx in retry behavior - all failures are retried.

## Retry Strategy

```
Attempt 1: Immediate
Attempt 2: +30s delay
Attempt 3: +60s delay (1 minute)
Attempt 4: +300s delay (5 minutes)
Attempt 5+: +900s delay (15 minutes)
```

By default, failed items are permanently deleted from the sync queue after 5 failed send attempts. Enable **Retry Failed Uploads** in advanced settings to keep retrying indefinitely. Either way, the location data itself is never deleted - it stays in the `locations` table and can still be exported.

## Network Requirements

- **HTTPS required** for all public endpoints
- **HTTP allowed** only for private/local addresses:
  - `127.0.0.1` / `localhost`
  - `192.168.x.x`
  - `10.x.x.x`
  - `172.16–31.x.x`
- Non-standard ports are supported (e.g., `https://my-server.com:8443/api`)
- Colota uses Android's default SSL trust store - custom CA certificates and self-signed certificates are not supported

## Connectivity Check

Colota checks Android's network connectivity manager before attempting sync. This check is cached for 5 seconds. When offline, locations are queued locally and synced automatically when the network returns.
