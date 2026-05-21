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

## Encrypted Backups

Colota can produce a single password-encrypted archive of your full dataset (locations, settings, geofences, credentials) for off-device storage or device migration. See the [Backup & Restore guide](/docs/guides/backup-restore) for the user-facing flow. The relevant security properties:

- **Cipher**: AES-256-GCM, chunked at 1 MiB of plaintext per chunk. Each chunk's GCM tag binds the file header as additional authenticated data, so any flip in the header (KDF parameters, salt, nonce prefix) invalidates the very first tag.
- **Key derivation**: Argon2id with 64 MiB memory, 3 iterations and 1 lane on standard devices; 32 MiB on devices flagged as low-RAM by Android. The salt is 32 bytes from `SecureRandom`, fresh per backup.
- **Password floor**: 12 characters, with a strength meter that enforces ~50 bits of entropy (passwords with sequential runs or fewer than 4 distinct characters are capped).
- **No recovery**: forgotten password means an unreadable file. There is no escrow, recovery code or developer override.
- **Credential handling**: the auth credentials Colota uses to talk to your tracking endpoint (Basic Auth username/password, Bearer token, custom HTTP headers) are extracted from `EncryptedSharedPreferences` and written as plaintext **inside** the encrypted container. They are protected by the backup password, not by the device's hardware-backed key. The blast radius equals whatever your server lets those credentials do - a credential limited to writing locations caps damage at fake location posts; a credential tied to a user with broader privileges, or any token with more scope than the endpoint actually needs, gives the attacker that same scope. Configure Colota with the minimum permission its endpoint requires. On restore the credentials are re-wrapped under the destination device's key.
- **mTLS**: the user-imported Trusted Server CA (public cert bytes) is included so a self-signed server stays reachable after restore. The mTLS **client certificate is not backed up** by design - the private key lives in the Android KeyChain (often hardware-backed) and cannot leave the source device. Re-import the `.p12` on the destination device after restore.
- **Format independence**: the on-disk format is FOSS (BouncyCastle, no Tink/Google dependency) and stays stable independently of the in-app `EncryptedSharedPreferences` implementation.

The format is fully documented in [`BackupFormat.kt`](https://github.com/dietrichmax/colota/blob/main/apps/mobile/android/app/src/main/java/com/colota/backup/BackupFormat.kt).

## What Colota Does Not Do

- No analytics, telemetry or crash reporting
- No advertising SDKs or tracking pixels
- No data shared with the developer or third parties
- No personal identifiers, device IDs or advertising IDs collected

For the full privacy policy, see the [Privacy Policy](/privacy-policy).
