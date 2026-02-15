---
sidebar_position: 5
---

# Custom Backend

Colota works with any backend that accepts HTTP requests (POST with JSON body or GET with query parameters).

## Minimum Requirements

Your server needs to:

- Accept `POST` requests with JSON body, or `GET` requests with query parameters
- Return a 2xx status code on success
- Handle `alt` and `bear` fields being absent (they are conditional)
- Handle up to 10 concurrent requests during batch sync

HTTPS is required for public endpoints. HTTP is allowed for local addresses (`127.0.0.1`, `192.168.x.x`, `10.x.x.x`).

## Default Payload

```json
{
  "lat": 51.495065,
  "lon": -0.043945,
  "acc": 12,
  "alt": 519,
  "vel": 0,
  "batt": 85,
  "bs": 2,
  "tst": 1704067200,
  "bear": 0.0
}
```

See the [API Reference](/docs/api-reference) for field types, units, and which fields are always present vs. conditional.

## Minimal Server Example

A minimal Node.js server that stores locations:

```js
const http = require("http")
const fs = require("fs")

http
  .createServer((req, res) => {
    if (req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => (body += chunk))
      req.on("end", () => {
        const location = JSON.parse(body)
        fs.appendFileSync("locations.jsonl", JSON.stringify(location) + "\n")
        res.writeHead(200)
        res.end()
      })
    }
  })
  .listen(3000)
```

Or with Python:

```python
from flask import Flask, request

app = Flask(__name__)

@app.route('/api/location', methods=['POST'])
def receive_location():
    location = request.get_json()
    with open('locations.jsonl', 'a') as f:
        import json
        f.write(json.dumps(location) + '\n')
    return '', 200
```

## Reverse Proxy

If your backend is behind a reverse proxy, make sure to forward the original headers.

**nginx:**

```nginx
location /api/location {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Content-Type $content_type;
}
```

**Caddy:**

```
your-domain.com {
    reverse_proxy /api/location localhost:3000
}
```

## Compatible Backends

Colota works with any service that accepts HTTP POST or GET requests. Built-in templates are available for:

- **[Dawarich](/docs/integrations/dawarich)** - Self-hosted location history
- **[OwnTracks](/docs/integrations/owntracks)** - Self-hosted presence tracking
- **[PhoneTrack](/docs/integrations/phonetrack)** - Nextcloud location tracking
- **[Reitti](/docs/integrations/reitti)** - Self-hosted location tracking
- **[Traccar](/docs/integrations/traccar)** - GPS tracking platform (HTTP GET)

Also works with:

- **Home Assistant** - via webhook or REST API
- **Node-RED** - flow-based automation
- **Any HTTP server** - that accepts POST (JSON) or GET (query params)

## Configuration

1. Go to **Settings > API Settings**
2. Select the **Custom** template (or start from any template and modify)
3. Set your endpoint URL
4. Customize [field mapping](/docs/configuration/field-mapping) to match your API
5. Configure [authentication](/docs/configuration/authentication) if needed
