---
title: "Forwarder"
description: "Send every location to several backends at once"
---

Colota sends to one endpoint. [colota-forwarder](https://github.com/dietrichmax/colota/tree/main/apps/forwarder) is a small self-hosted service that receives those requests and forwards each location to several backends, converting the format for each one. It also accepts the OwnTracks app over HTTP.

The forwarder answers the phone as soon as it accepts a request and forwards in the background. [Forwarder Reference](forwarder-reference.md) lists every setting.

> [!WARNING]
>
> Set a strong `API_KEY` before the forwarder is reachable from the internet. Without one, anyone who reaches it can send locations to all your backends. The forwarder does not terminate TLS, so put it behind a reverse proxy that does.

## Setup

### 1. Create the compose file

Save this as `compose.yml`:

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

To update on your own schedule, replace `latest` with a version tag from [Docker Hub](https://hub.docker.com/r/mxdcodes/colota-forwarder/tags).

### 2. Configure the targets

Create a `.env` file next to it. Each backend is one numbered target:

```env
API_KEY=your-secret-key

TARGET_1_URL=http://homeassistant:8123/api/webhook/your-webhook-id
TARGET_1_TYPE=colota

TARGET_2_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=your-key
TARGET_2_TYPE=owntracks
```

Generate the key with `openssl rand -base64 32`. Targets are numbered from 1 without gaps. A skipped number drops every target after it. [Backends](#backends) shows the settings for each server.

### 3. Start the forwarder

```sh
docker compose up -d
```

### 4. Point Colota at the forwarder

1. Open **Settings → Connection** and set the endpoint for the way Colota uploads:

   | Upload        | Template                                  | Endpoint                        |
   | ------------- | ----------------------------------------- | ------------------------------- |
   | Single points | Custom                                    | `https://your-server/locations` |
   | Batches       | Overland, or Dawarich with the Batch chip | `https://your-server/overland`  |

2. Open **Settings → Connection → Authentication**, choose **Bearer token** and enter the API key.

See [Authentication](../configuration/authentication.md) for the other methods.

### OwnTracks App

The forwarder also accepts the OwnTracks app in HTTP mode at `https://your-server/owntracks?api_key=your-key`. Only `_type: "location"` messages are forwarded. Region transitions and waypoints from the OwnTracks app are dropped.

## Backends

Each block goes into `.env`. Give every target the next free number.

### Home Assistant

Install the [Colota integration](home-assistant.md) and copy the webhook URL it shows.

```env
TARGET_1_URL=http://homeassistant:8123/api/webhook/your-colota-webhook-id
TARGET_1_TYPE=colota
```

The payload is forwarded unchanged. The entity is named after the point's `tid`, so `tid: "iphone15"` becomes `device_tracker.iphone15`. With batch uploads, add `TARGET_1_BATCH_MODE=latest` so Home Assistant gets the newest point of each upload instead of a replay of the whole batch.

> [!NOTE] Home Assistant Cloud
>
> With Home Assistant Cloud, the webhook URL points to `https://hooks.nabu.casa/<unique_id>`. The local form is `http://<your-ha>:8123/api/webhook/<webhook_id>`. The webhook id is in the `Colota Webhook` entry of `/config/.storage/core.config_entries`, or on the Home Assistant host:
>
> ```shell
> jq '.data.entries[] | select(.domain=="colota") | .data' /config/.storage/core.config_entries
> ```

Home Assistant's built-in OwnTracks integration works too. Add it under **Settings → Devices & Services → Add Integration → OwnTracks** and open **Configure** to see the webhook URL.

```env
TARGET_1_URL=http://homeassistant:8123/api/webhook/your-owntracks-webhook-id
TARGET_1_TYPE=owntracks
# TARGET_1_USER=colota
# TARGET_1_DEVICE=phone
```

The tracker appears as `device_tracker.colota_phone` after the first update. A `tid` in the payload replaces `DEVICE`, so `tid: "iphone15"` lands as `device_tracker.colota_iphone15`.

### Dawarich

```env
TARGET_2_URL=https://dawarich.example.com/api/v1/owntracks/points?api_key=your-key
TARGET_2_TYPE=owntracks
```

With batch uploads, an `overland` target pointed at `/api/v1/overland/batches` sends each batch in one request. See [Batch Handling](forwarder-reference.md#batch-handling).

### GeoPulse

GeoPulse protects `/api/colota` with HTTP Basic auth, so this target needs `TARGET_n_AUTH`:

```env
TARGET_3_URL=https://geopulse.example.com/api/colota
TARGET_3_TYPE=geopulse
TARGET_3_AUTH=Basic <base64 of user:password>
```

1. In GeoPulse, open **Location Sources → Add source → Colota**
2. Set a username and password. These are not your GeoPulse login
3. Make sure the source is enabled
4. Encode the pair with `printf '%s' 'youruser:yourpassword' | base64`

### Traccar

OsmAnd protocol over GET, the default:

```env
TARGET_4_URL=https://traccar.example.com:5055
TARGET_4_TYPE=traccar
```

Traccar JSON over POST, for Traccar 6.7.0 and later:

```env
TARGET_4_URL=https://traccar.example.com:5055
TARGET_4_TYPE=traccar
TARGET_4_METHOD=POST
```

`TARGET_4_TID` sets the device ID in Traccar. It defaults to `colota`.

### Reitti

```env
TARGET_5_URL=https://reitti.example.com/api/v1/ingest/owntracks?token=your-reitti-token
TARGET_5_TYPE=owntracks
```

### OwnTracks Recorder

```env
TARGET_6_URL=http://recorder:8083/pub
TARGET_6_TYPE=owntracks
```

## Security

- **API key** - The forwarder refuses to start while `API_KEY` is still the example value `your-secret-key`
- **Header over query** - Send the key as a header. Query strings end up in the proxy's access log
- **Rate limit** - The forwarder does not limit how fast someone can guess the key. Add a rate limit at the proxy
- **TLS** - Run it behind a reverse proxy such as Caddy. The forwarder does not terminate TLS
- **Local port** - The compose file binds to `127.0.0.1`, so the port is only reachable through the proxy
