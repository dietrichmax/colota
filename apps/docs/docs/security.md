---
sidebar_position: 12
---

# Security

An overview of how Colota handles your data at rest, in transit and on-device.

## Data in Transit

HTTPS is enforced for all public server endpoints. HTTP is only allowed for private/local network addresses (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, `100.64.x.x`, `localhost`) to support self-hosted setups. Self-signed TLS certificates are supported by installing your CA certificate on the device via Android system settings.

## Credentials at Rest

Authentication credentials (Basic auth, Bearer tokens, custom headers) are stored using Android's [`EncryptedSharedPreferences`](https://developer.android.com/reference/androidx/security/crypto/EncryptedSharedPreferences) with **AES-256-GCM** encryption. Credentials never leave the device except as HTTP headers sent to your configured endpoint.

Sensitive values (Authorization, Bearer, Token, API-Key) are automatically masked in log exports.

## Location Data at Rest

Location history is stored in a local SQLite database on the device. The database is **not encrypted**. This means someone with physical access to a rooted device could read the data. For a self-hosted app where the user controls both the device and the server, this is a reasonable tradeoff.

The database is not accessible to other apps (standard Android sandboxing).

## What Colota Does Not Do

- No analytics, telemetry or crash reporting
- No advertising SDKs or tracking pixels
- No data shared with the developer or third parties
- No personal identifiers, device IDs or advertising IDs collected

For the full privacy policy, see the [Privacy Policy](/privacy-policy).
