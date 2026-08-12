<p align="center">
  <img src="banner.svg" width="100%" alt="colota-forwarder" />
</p>

# colota-forwarder

[![Shield: Docker Pulls](https://img.shields.io/docker/pulls/mxdcodes/colota-forwarder?label=Docker%20Pull)](https://hub.docker.com/r/mxdcodes/colota-forwarder) ![Shield: Docker Image Size](https://img.shields.io/docker/image-size/mxdcodes/colota-forwarder/latest?label=Image%20Size) [![Build](https://github.com/dietrichmax/colota-forwarder/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/dietrichmax/colota-forwarder/actions/workflows/docker-publish.yml)

Receives location updates from the [Colota](https://colota.app) app or any OwnTracks HTTP client (Android/iOS) and forwards them to multiple services at once — Home Assistant, Dawarich, GeoPulse, Traccar, Reitti, OwnTracks Recorder or any HTTP endpoint. The forwarder responds to the client immediately and fans the update out to all targets in the background, converting the format for each service as needed.

> **Warning:** Never expose colota-forwarder to the internet without setting a strong `API_KEY`. Without it, anyone who can reach the forwarder can send arbitrary location data to all your targets. The forwarder does not terminate TLS — expose it only through a reverse proxy that does.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/locations` | yes | Colota native payload — fans out to all matching targets |
| `POST` | `/owntracks` | yes | OwnTracks HTTP payload — only `_type: "location"` is forwarded, others drop |
| `POST` | `/overland` | yes | Colota batch payload (Overland format) - forwarded whole to `overland` targets, split to single points for the rest |
| `GET` | `/health` | no | Health check for Docker / orchestrators — returns `{ status, uptime, targets }` |

## Setup

**1. Create a `compose.yml`**

```yaml
services:
  colota-forwarder:
    image: mxdcodes/colota-forwarder:v0.3.0
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env
    read_only: true
    security_opt:
      - no-new-privileges:true
    mem_limit: 128m
    cpus: "0.5"
```

**2. Create a `.env` file**

Copy `.env.example` to `.env` and fill in your targets:

```env
API_KEY=your-secret-key

TARGET_1_URL=http://homeassistant:8123/api/webhook/your-webhook-id
TARGET_1_TYPE=owntracks

TARGET_2_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=your-key
TARGET_2_TYPE=owntracks
```

Targets are numbered consecutively starting at 1. If a number is skipped, everything after it is ignored. See [Target types](#target-types) for the available `TARGET_n_TYPE` values.

**3. Start**

```sh
docker compose up -d
```

**4. Point your app at the forwarder**

- **Colota (single point):** use the **Custom** API scheme and set the endpoint to `https://your-server/locations`
- **Colota (batch mode):** pick the **Overland** template (or **Dawarich** + Batch chip) and set the endpoint to `https://your-server/overland?api_key=your-key`
- **OwnTracks (Android/iOS):** set mode to HTTP and the URL to `https://your-server/owntracks?api_key=your-key`. Only `_type: "location"` payloads are forwarded — region transitions, waypoints, and other event types are dropped.

Authentication is accepted via `x-api-key` header, `?api_key=` query param, or `Authorization: Bearer` header.

## Integrations

### Home Assistant

**Recommended — native [Colota integration](https://github.com/dietrichmax/colota-home-assistant):**

Install the [Colota integration](https://github.com/dietrichmax/colota-home-assistant) in Home Assistant, then **Settings → Devices & Services → Add integration → Colota** and copy the webhook URL it shows.

```env
TARGET_1_URL=http://homeassistant:8123/api/webhook/your-colota-webhook-id
TARGET_1_TYPE=colota
```

The payload is forwarded unchanged (no OwnTracks conversion). The HA entity is named from the payload's `tid` field — e.g. `tid: "iphone15"` becomes `device_tracker.iphone15`.

If the Colota app uses batch mode (Overland template), add `TARGET_n_BATCH_MODE=latest` so HA receives only the newest fix per upload instead of a replay of the whole batch — HA tracks the current position, not history. See [Batch handling](#batch-handling).

**Alternative — built-in OwnTracks webhook:**

If you'd rather not install a custom integration, HA's built-in OwnTracks webhook also works. Add the OwnTracks integration via **Settings → Devices & Services → Add integration → OwnTracks**, then open its **Configure** dialog to reveal the webhook URL.

```env
TARGET_1_URL=http://homeassistant:8123/api/webhook/your-owntracks-webhook-id
TARGET_1_TYPE=owntracks
# TARGET_1_USER=colota   # default: colota - used in the entity name
# TARGET_1_DEVICE=phone  # default: phone  - used in the entity name
```

The device tracker shows up as `device_tracker.colota_phone` after the first update. If the payload contains a `tid` field, it overrides `DEVICE` — e.g. `tid: "iphone15"` lands as `device_tracker.colota_iphone15`.

### Dawarich

```env
TARGET_2_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=your-key
TARGET_2_TYPE=owntracks
```

### GeoPulse

GeoPulse protects its `/api/colota` endpoint with HTTP **Basic auth**, so this target needs `TARGET_n_AUTH`:

```env
TARGET_3_URL=https://geopulse.example.com/api/colota
TARGET_3_TYPE=geopulse
TARGET_3_AUTH=Basic <base64 of user:password>
```

The username and password are **not** your GeoPulse login. In GeoPulse open **Location Sources → Add source → Colota**, set a username and password there, and make sure the source is **enabled**. Then base64-encode those exact credentials:

```sh
printf '%s' 'youruser:yourpassword' | base64   # → eW91cnVzZXI6…
# TARGET_3_AUTH=Basic eW91cnVzZXI6…
```

### Traccar

GET (OsmAnd protocol, default):

```env
TARGET_4_URL=https://traccar.example.com:5055
TARGET_4_TYPE=traccar
# TARGET_4_TID=colota  # device ID in Traccar, default: colota
```

POST (JSON, requires Traccar 5.1+):

```env
TARGET_4_URL=https://traccar.example.com:5055
TARGET_4_TYPE=traccar
TARGET_4_METHOD=POST
# TARGET_4_TID=colota  # device ID in Traccar, default: colota
```

### Reitti

```env
TARGET_5_URL=https://reitti.example.com/api/v1/ingest/owntracks?token=your-reitti-token
TARGET_5_TYPE=owntracks
```

### OwnTracks Recorder

OwnTracks Recorder uses the same format and headers as the HA integration, so `TYPE=owntracks` works:

```env
TARGET_6_URL=http://recorder:8083/pub
TARGET_6_TYPE=owntracks
```

## Reference

### Target types

| Type | Use for | Notes |
| --- | --- | --- |
| `owntracks` | Home Assistant (built-in OwnTracks integration), Dawarich, Reitti, OwnTracks Recorder | Converts to OwnTracks format, adds `X-Limit-U` / `X-Limit-D` headers |
| `traccar` | Traccar | GET (OsmAnd protocol) by default; set `METHOD=POST` for the Traccar JSON API |
| `overland` | Dawarich (native batch endpoint), any Overland-compatible server | Forwards the **whole** Overland batch unchanged. Point the URL at the destination's batch endpoint (Dawarich: `/api/v1/overland/batches`) |
| `geopulse` / `colota` / `raw` | Home Assistant ([Colota integration](https://github.com/dietrichmax/colota-home-assistant)), GeoPulse, Colota-native services, custom endpoints | Passes the Colota payload through unchanged — names exist for documentation only |

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `API_KEY` | - | If set, requests must include it via `x-api-key` header, `?api_key=` query param, or `Authorization: Bearer` |
| `FORWARD_TIMEOUT_MS` | `30000` | Per-target HTTP timeout in milliseconds |
| `MAX_BATCH_POINTS` | `10000` | Max points in one `/overland` batch; larger batches are rejected with `413` |
| `MAX_QUEUED_POINTS` | `50000` | Max points still being forwarded before `/overland` replies `429` + `Retry-After` |
| `SPLIT_CONCURRENCY` | `1` | Default max in-flight requests per target when splitting a batch (non-`overland` targets) |
| `SPLIT_DELAY_MS` | `0` | Default delay between requests per target when splitting a batch |
| `TARGET_n_URL` | - | Forward destination (n = 1-20, must be consecutive) |
| `TARGET_n_TYPE` | `raw` | `owntracks`, `geopulse`, `traccar`, `colota`, `overland`, or `raw` |
| `TARGET_n_METHOD` | auto | `GET` or `POST` - overrides the default method for the target type |
| `TARGET_n_AUTH` | - | Full `Authorization` header value — e.g. `Bearer your-token`, or `Basic <base64 of user:pass>` for GeoPulse. Sent verbatim as the `Authorization` header (targets that read `?api_key=` instead should put the key in `TARGET_n_URL`) |
| `TARGET_n_TID` | `CL` (owntracks) / `colota` (traccar) | Tracker ID for `owntracks` targets / device ID for `traccar` targets |
| `TARGET_n_USER` | `colota` | `X-Limit-U` header for `owntracks` targets |
| `TARGET_n_DEVICE` | `phone` | `X-Limit-D` fallback for `owntracks` targets - overridden by the payload's `tid` field when present |
| `TARGET_n_FILTER_TID` | - | Only forward to this target when payload `tid` matches this value |
| `TARGET_n_BATCH_MODE` | `split` | How a batch upload is handled: `split` (one request per point) or `latest` (newest point only) |
| `TARGET_n_SPLIT_CONCURRENCY` | (global) | Per-target override of `SPLIT_CONCURRENCY` |
| `TARGET_n_SPLIT_DELAY_MS` | (global) | Per-target override of `SPLIT_DELAY_MS` |

## Advanced

### Batch handling

When the Colota app uses the **Overland** template (or **Dawarich** + Batch mode), it uploads multiple points in one request to `/overland`. The forwarder handles each target according to its type and `BATCH_MODE`:

- **`overland` targets** receive the batch **whole** — one HTTP request per upload, regardless of how many points it contains. This is the efficient path; use it whenever the destination understands the Overland batch format (Dawarich does natively).
- **`TARGET_n_BATCH_MODE=latest`** forwards only the **newest point** of the batch as a single request. Use it for live-state sinks like Home Assistant that track the _current_ position rather than history — it avoids replaying a backlog (which would spam zone automations and bloat history with points stamped at ingestion time).
- **Otherwise the batch is split** (`BATCH_MODE=split`, the default) into one request per point. To avoid hammering your own server with a burst of requests, the split is **serial by default** (one request at a time, in chronological order). Tune it with:

  | Variable                     | Default  | Description                                                          |
  | ---------------------------- | -------- | -------------------------------------------------------------------- |
  | `TARGET_n_BATCH_MODE`        | `split`  | `split` (one request per point) or `latest` (newest point only)      |
  | `SPLIT_CONCURRENCY`          | `1`      | Global default for max in-flight requests per target while splitting |
  | `SPLIT_DELAY_MS`             | `0`      | Global default delay between requests per target while splitting     |
  | `TARGET_n_SPLIT_CONCURRENCY` | (global) | Per-target override of `SPLIT_CONCURRENCY`                           |
  | `TARGET_n_SPLIT_DELAY_MS`    | (global) | Per-target override of `SPLIT_DELAY_MS`                              |

  Example — feed Dawarich the raw batch for full history, give Home Assistant just the latest fix, and trickle into a self-hosted Traccar at most 2 at a time with a 200 ms gap:

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

A phone that has been offline uploads everything it saved at once. Split targets send one request per point, so a long backlog becomes a lot of requests. Two limits stop that from hammering your services:

| Variable            | Default | Description                                                                        |
| ------------------- | ------- | ---------------------------------------------------------------------------------- |
| `MAX_BATCH_POINTS`  | `10000` | Larger batches are rejected with `413` (more than fits in one 1 MB request anyway) |
| `MAX_QUEUED_POINTS` | `50000` | Above this many points still in flight, `/overland` replies `429` + `Retry-After`  |

Neither loses data — the app keeps the points it could not send and retries later. For a large backlog, use an `overland` target instead, which sends the whole batch in one request, or set `BATCH_MODE=latest`. Raise `SPLIT_CONCURRENCY` if you want split targets to drain faster.

### Multi-user / TID routing

When multiple phones share one forwarder instance, use `FILTER_TID` to route each phone's data to the correct target. Set a unique `tid` custom field in each phone's Colota app (Settings → API Settings → Custom Fields → add key `tid`), then configure targets with `FILTER_TID` to match. Unlike OwnTracks' two-character TID convention, the forwarder treats `tid` as a free-form string — `phone1`, `iphone15` or `alice` all work.

```env
# Phone 1 → Dawarich user 1
TARGET_1_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=user1-key
TARGET_1_TYPE=owntracks
TARGET_1_FILTER_TID=phone1

# Phone 2 → Dawarich user 2
TARGET_2_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=user2-key
TARGET_2_TYPE=owntracks
TARGET_2_FILTER_TID=phone2

# Home Assistant — receives all phones (no FILTER_TID set)
TARGET_3_URL=http://homeassistant:8123/api/webhook/your-webhook-id
TARGET_3_TYPE=owntracks
```

Targets without `FILTER_TID` receive data from all phones. Targets with `FILTER_TID` only receive data when the payload's `tid` matches.

**Using the OwnTracks app instead of Colota?** The `tid` from OwnTracks `/owntracks` payloads is preserved and routed the same way — but the OwnTracks app limits its Tracker ID (Preferences → Identification) to **2 characters**, so set both the app's TID and `FILTER_TID` to the same short code (e.g. `p1`). The free-form names above (`phone1`, `alice`) only work with the Colota app's custom `tid` field.

## Security

- Set a strong, random `API_KEY` in your `.env` before going public
- Run behind a reverse proxy (Traefik, Caddy, etc.) that handles TLS — the forwarder does not terminate TLS itself
- The `compose.yml` binds to `127.0.0.1` so the port is not reachable from outside without a proxy

## License

[AGPL-3.0-or-later](LICENSE)
