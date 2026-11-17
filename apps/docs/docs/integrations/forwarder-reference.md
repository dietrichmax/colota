---
title: "Forwarder Reference"
description: "Endpoints, target types and settings of colota-forwarder"
---

Every setting goes into the forwarder's `.env`. [Forwarder](forwarder.md) covers the setup.

## Endpoints

| Method | Path | Auth | Accepts |
| --- | --- | --- | --- |
| `POST` | `/locations` | yes | Colota's field-mapped payload, forwarded to all matching targets with [geofence events](#geofence-events) |
| `POST` | `/owntracks` | yes | The OwnTracks app's HTTP payload. Only `_type: "location"` is forwarded |
| `POST` | `/overland` | yes | Colota's Overland batch, sent whole to `overland` targets and split into single points for the rest |
| `GET` | `/health` | no | `{ status, uptime, targets }`, plus per-target delivery counts when the API key is sent |

The API key is accepted as an `Authorization: Bearer` header, an `x-api-key` header or an `?api_key=` query parameter. `/health` reads it from a header only.

## Target Types

| Type | Use for | What the target gets |
| --- | --- | --- |
| `owntracks` | Home Assistant's OwnTracks integration, Dawarich, Reitti, OwnTracks Recorder | OwnTracks format with `X-Limit-U` and `X-Limit-D` headers |
| `traccar` | Traccar | OsmAnd over GET by default. `TARGET_n_METHOD=POST` sends Traccar JSON |
| `overland` | Dawarich's batch endpoint, any Overland server | The whole Overland batch, unchanged. Point the URL at the batch endpoint |
| `geopulse` / `colota` / `raw` | GeoPulse, the [Colota integration](home-assistant.md) for Home Assistant, custom servers | The Colota payload, unchanged |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `API_KEY` | - | Required on every POST when set |
| `FORWARD_TIMEOUT_MS` | `30000` | Per-target HTTP timeout in milliseconds |
| `MAX_BATCH_POINTS` | `10000` | Largest `/overland` batch. Larger ones get `413` |
| `MAX_QUEUED_POINTS` | `50000` | Points still being forwarded before `/overland` answers `503` with `Retry-After` |
| `SPLIT_CONCURRENCY` | `1` | Requests in flight per target while splitting a batch |
| `SPLIT_DELAY_MS` | `0` | Delay between requests per target while splitting a batch |
| `TARGET_n_URL` | - | Destination. `n` runs from 1 to 20 without gaps |
| `TARGET_n_TYPE` | `raw` | `owntracks`, `geopulse`, `traccar`, `colota`, `overland` or `raw` |
| `TARGET_n_METHOD` | per type | `GET` or `POST` |
| `TARGET_n_AUTH` | - | Full `Authorization` header value, such as `Bearer your-token` or `Basic <base64>`. A target that reads `?api_key=` takes it in the URL instead |
| `TARGET_n_TID` | `CL` (owntracks), `colota` (traccar) | Tracker ID for `owntracks` targets, device ID for `traccar` targets |
| `TARGET_n_USER` | `colota` | `X-Limit-U` header for `owntracks` targets |
| `TARGET_n_DEVICE` | `phone` | `X-Limit-D` header for `owntracks` targets. A `tid` in the payload replaces it |
| `TARGET_n_FILTER_TID` | - | Forward only points whose `tid` matches |
| `TARGET_n_BATCH_MODE` | `split` | `split` sends one request per point, `latest` only the newest point |
| `TARGET_n_SPLIT_CONCURRENCY` | global | Per-target `SPLIT_CONCURRENCY` |
| `TARGET_n_SPLIT_DELAY_MS` | global | Per-target `SPLIT_DELAY_MS` |

## Delivery Status

A `200` from the forwarder means it accepted the point, not that a target stored it. Send the API key to `/health` to see how each target is doing:

```sh
curl -H "x-api-key: $API_KEY" http://localhost:3000/health
```

```json
{
  "status": "ok",
  "uptime": 1832.4,
  "targets": 2,
  "delivery": [
    { "target": 1, "host": "dawarich:3000", "ok": 412, "failed": 0, "lastOkAt": "2026-08-12T09:41:02.881Z" },
    {
      "target": 2,
      "host": "geopulse.example.com",
      "ok": 0,
      "failed": 412,
      "lastFailAt": "2026-08-12T09:41:02.883Z",
      "lastError": "HTTP 401"
    }
  ]
}
```

`target` is the `n` in `TARGET_n`, so it matches your `.env` even when two targets share a host. A rising `failed` count means the target rejects your points, and `lastError` says why. Counts start at the last restart.

## Batch Handling

With the Overland template, or Dawarich with the Batch chip, Colota uploads several points in one request to `/overland`. Each target handles the batch by its type and `TARGET_n_BATCH_MODE`:

- **`overland` targets** - Get the whole batch in one request. Use this whenever the backend reads Overland batches, as Dawarich does
- **`latest`** - Gets only the newest point. Use it for Home Assistant, which tracks the current position, so a backlog does not replay through zone automations
- **`split`** - The default. One request per point, one at a time and oldest first. `SPLIT_CONCURRENCY` and `SPLIT_DELAY_MS` set the pace

This setup sends Dawarich the full batch, Home Assistant the newest point and a self-hosted Traccar at most two requests at a time, 200 ms apart:

```env
TARGET_1_URL=https://dawarich.example.com/api/v1/overland/batches?api_key=your-key
TARGET_1_TYPE=overland

TARGET_2_URL=http://homeassistant:8123/api/webhook/your-webhook-id
TARGET_2_TYPE=colota
TARGET_2_BATCH_MODE=latest

TARGET_3_URL=https://traccar.example.com:5055
TARGET_3_TYPE=traccar
TARGET_3_SPLIT_CONCURRENCY=2
TARGET_3_SPLIT_DELAY_MS=200
```

A phone that was offline uploads its whole backlog at once, and a split target turns that into one request per point. `MAX_BATCH_POINTS` and `MAX_QUEUED_POINTS` cap it. No points are lost: Colota keeps what it could not send and retries later.

## Geofence Events

With **Send enter and leave events**, Colota also sends an event each time the phone enters or leaves a geofence. With **Send current geofences**, every point carries the geofences it is in as `inregions`. The forwarder sends each event where Colota would if it posted to that backend directly:

| Target type | Event from `/locations` | Events from `/overland` |
| --- | --- | --- |
| `owntracks` | OwnTracks transition (`_type: "transition"` with `event`, `desc`, `t`, `wtst`) | Not sent |
| `traccar` | Not sent | Not sent |
| `geopulse` / `colota` / `raw` | Passed through unchanged | Not sent |
| `overland` | Passed through unchanged, like a point | In the batch's `transitions` array |

An Overland event carries no `wtst`, which OwnTracks requires, so `owntracks` targets get events only from `/locations`. `inregions` reaches every type except `traccar`. See [Request format](../configuration/request-format.md) for both settings.

## Several Phones

`TARGET_n_FILTER_TID` sends each phone's points to its own targets:

1. Give each phone a `tid` custom field in **Settings → Connection → Request format → Custom fields**, such as `phone1`
2. Set `TARGET_n_FILTER_TID` to the same value on the targets for that phone

```env
TARGET_1_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=user1-key
TARGET_1_TYPE=owntracks
TARGET_1_FILTER_TID=phone1

TARGET_2_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=user2-key
TARGET_2_TYPE=owntracks
TARGET_2_FILTER_TID=phone2

TARGET_3_URL=http://homeassistant:8123/api/webhook/your-webhook-id
TARGET_3_TYPE=owntracks
```

A target without `TARGET_n_FILTER_TID` gets every phone. The `tid` is free text, so `phone1` or `alice` both work. The OwnTracks app limits its Tracker ID to two characters, so use a short code such as `p1` there.

## Certificates

A target with a certificate from your own CA, or a self-signed one, fails with a certificate error in `lastError`, such as `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` or `DEPTH_ZERO_SELF_SIGNED_CERT`. The forwarder is the TLS client here, so the forwarder has to trust the CA. Mount the CA certificate, or the whole chain as one PEM file, and point Node at it:

```yaml
environment:
  NODE_EXTRA_CA_CERTS: /certs/my-ca.pem
volumes:
  - ./my-ca.pem:/certs/my-ca.pem:ro
```

The file must be readable by the container's non-root user. Targets on the same Docker network can use plain `http://` and need no certificate.
