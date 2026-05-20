---
sidebar_position: 5
---

# Authentication

import ScreenshotGallery from '@site/src/components/ScreenshotGallery'

Colota supports multiple authentication methods, configurable in **Settings > Authentication & Headers**.

<ScreenshotGallery screenshots={[ { src: "/img/screenshots/Authentication.png", label: "Authentication" }, ]} />

## Methods

| Method                 | Description                         | Sent at              |
| ---------------------- | ----------------------------------- | -------------------- |
| **None**               | No authentication (default)         | --                   |
| **Basic Auth**         | Username + password                 | HTTP header          |
| **Bearer Token**       | API token / JWT                     | HTTP header          |
| **Custom Headers**     | Any key-value pairs                 | HTTP header          |
| **Client Certificate** | PKCS12 (.p12 / .pfx) for mutual TLS | TLS handshake (mTLS) |

mTLS is orthogonal to the HTTP-level methods and can be combined with any of them - a common setup is mTLS at the reverse-proxy layer + Bearer at the application layer. See [mTLS](./mtls) for the dedicated guide.

## Credential Storage

HTTP credentials (Basic Auth, Bearer tokens, custom headers, imported server CAs) are stored encrypted on-device using Android's `EncryptedSharedPreferences`. Credentials never leave the device except as HTTP headers sent to your configured endpoint.

Client certificate private keys are stored in the OS keystore, kept separate from other app credentials. The PKCS12 password you enter is used once during import and is not saved.

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
