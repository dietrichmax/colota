<p align="center">
  <img src="banner.svg" width="100%" alt="colota-forwarder" />
</p>

# colota-forwarder

[![Shield: Docker Pulls](https://img.shields.io/docker/pulls/mxdcodes/colota-forwarder?label=Docker%20Pull)](https://hub.docker.com/r/mxdcodes/colota-forwarder) ![Shield: Docker Image Size](https://img.shields.io/docker/image-size/mxdcodes/colota-forwarder/latest?label=Image%20Size) [![Build](https://github.com/dietrichmax/colota-forwarder/actions/workflows/pipeline.yml/badge.svg)](https://github.com/dietrichmax/colota-forwarder/actions/workflows/pipeline.yml)

Receives location updates from the [Colota](https://colota.app) app and forwards them to multiple services at once - Home Assistant, Dawarich, GeoPulse, Traccar, Reitti, or any HTTP endpoint. The forwarder responds to Colota immediately and fans the update out to all targets in the background, converting the format for each service as needed.

> **Warning:** Never expose colota-forwarder to the internet without setting a strong `API_KEY`. Without it, anyone who can reach the forwarder can send arbitrary location data to all your targets. Always run behind a reverse proxy with TLS.

## Setup

**1. Create a `compose.yml`**

```yaml
services:
  colota-forwarder:
    image: mxdcodes/colota-forwarder:latest
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

Targets are numbered consecutively starting at 1. If a number is skipped, everything after it is ignored.

**3. Start**

```sh
docker compose up -d
```

**4. Point your app at the forwarder**

- **Colota:** use the **Colota** (default/custom) API scheme and set the endpoint to `https://your-server/locations`
- **OwnTracks:** set mode to HTTP and the URL to `https://your-server/owntracks?api_key=your-key`

Authentication is accepted via `x-api-key` header, `?api_key=` query param, or `Authorization: Bearer` header.

## Integrations

### Home Assistant

Go to **Settings → Devices & Services → Add integration → OwnTracks**, copy the webhook URL, then:

```env
TARGET_1_URL=http://homeassistant:8123/api/webhook/your-webhook-id
TARGET_1_TYPE=owntracks
# TARGET_1_USER=colota   # default: colota - used in the entity name
# TARGET_1_DEVICE=phone  # default: phone  - used in the entity name
```

The device tracker shows up as `device_tracker.colota_phone` after the first update.

### Dawarich

```env
TARGET_2_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=your-key
TARGET_2_TYPE=owntracks
```

### GeoPulse

```env
TARGET_3_URL=https://geopulse.example.com/api/colota
TARGET_3_TYPE=geopulse
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

## Target types

| Type | Use for | Notes |
| --- | --- | --- |
| `owntracks` | Home Assistant, Dawarich, Reitti, OwnTracks Recorder | Converts to OwnTracks format, adds `X-Limit-U`/`X-Limit-D` headers |
| `geopulse` | GeoPulse | Passes Colota payload unchanged |
| `traccar` | Traccar | GET (OsmAnd protocol) by default, set `METHOD=POST` for JSON |
| `colota` / `raw` | Custom endpoints | Passes payload unchanged |

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `API_KEY` | - | If set, requests must include it via `x-api-key` header or `?api_key=` query param |
| `TARGET_n_URL` | - | Forward destination (n = 1-20, must be consecutive) |
| `TARGET_n_TYPE` | `raw` | `owntracks`, `geopulse`, `traccar`, `colota`, or `raw` |
| `TARGET_n_METHOD` | auto | `GET` or `POST` - overrides the default method for the target type |
| `TARGET_n_AUTH` | - | Full `Authorization` header value (e.g. `Bearer your-token`) |
| `TARGET_n_TID` | `CL` | Tracker ID for `owntracks` / device ID for `traccar` |
| `TARGET_n_USER` | `colota` | `X-Limit-U` header for `owntracks` targets |
| `TARGET_n_DEVICE` | `phone` | `X-Limit-D` header for `owntracks` targets |
| `TARGET_n_FILTER_TID` | - | Only forward to this target when payload `tid` matches this value |

## Multi-user / TID routing

When multiple phones share one forwarder instance, use `FILTER_TID` to route each phone's data to the correct target. Set a unique `tid` custom field in each phone's Colota app (Settings → API Settings → Custom Fields → add key `tid`), then configure targets with `FILTER_TID` to match:

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

## Security

- Set a strong, random `API_KEY` in your `.env` before going public
- Run behind a reverse proxy (Traefik, Caddy, etc.) that handles TLS — the forwarder does not terminate TLS itself
- The `compose.yml` binds to `127.0.0.1` so the port is not reachable from outside without a proxy
