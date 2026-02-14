---
sidebar_position: 5
---

# Authentication

Colota supports multiple authentication methods, configurable in **Settings > Authentication & Headers**.

## Methods

| Method             | Description                 | Header Sent                     |
| ------------------ | --------------------------- | ------------------------------- |
| **None**           | No authentication (default) | --                              |
| **Basic Auth**     | Username + password         | `Authorization: Basic <base64>` |
| **Bearer Token**   | API token / JWT             | `Authorization: Bearer <token>` |
| **Custom Headers** | Any key-value pairs         | As configured                   |

## Credential Storage

All credentials are stored encrypted on-device using **AES-256-GCM** via Android's `EncryptedSharedPreferences`. Credentials never leave the device except as HTTP headers sent to your configured endpoint.

## Custom HTTP Headers

Add arbitrary HTTP headers for proxies, API gateways, or services like Cloudflare Access. Each header is a key-value pair sent with every request.

## Testing with curl

Replicate what Colota sends using curl to test your server:

**Basic Auth:**

```bash
curl -X POST https://your-server.com/api/location \
  -H "Content-Type: application/json; charset=UTF-8" \
  -H "Authorization: Basic $(echo -n 'user:password' | base64)" \
  -d '{"lat":48.135,"lon":11.582,"acc":12,"vel":0,"batt":85,"bs":2,"tst":1704067200}'
```

**Bearer Token:**

```bash
curl -X POST https://your-server.com/api/location \
  -H "Content-Type: application/json; charset=UTF-8" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"lat":48.135,"lon":11.582,"acc":12,"vel":0,"batt":85,"bs":2,"tst":1704067200}'
```
