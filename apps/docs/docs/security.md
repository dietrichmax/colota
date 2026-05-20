---
sidebar_position: 12
---

# Security

An overview of how Colota handles your data at rest, in transit and on-device.

## Data in Transit

HTTPS is enforced for all public server endpoints. HTTP is only allowed for private/local network addresses (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`, `100.64.x.x`, `localhost`) to support self-hosted setups.

### TLS trust anchors

Colota's HTTPS chain validation accepts two trust sources, either of which is sufficient:

1. **System CAs** that ship with Android - the normal public web (Let's Encrypt, DigiCert, etc.)
2. **In-app imported CA** added via Settings -> Authentication & Headers -> Client Certificate (mTLS) -> Trusted Server CA. One slot, trusted only by Colota.

User-installed device CAs (from Android Settings -> Encryption & credentials) are not honored, so malware or a coerced profile that plants a CA in the device store can't intercept Colota's sync. Self-hosted users running a private CA should import it via the in-app path.

### Mutual TLS (mTLS)

For servers that require a client certificate at the TLS handshake (e.g. nginx `ssl_verify_client`, Traefik, Cloudflare Access), Colota supports importing a PKCS12 (`.p12` / `.pfx`) bundle. The private key is stored in the OS keystore and the password you enter during import is not saved. See the [mTLS guide](./configuration/mtls) for setup details.

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
