---
sidebar_position: 6
---

# Mutual TLS (mTLS)

Authenticate to your server with a client certificate at the TLS handshake, in addition to (or instead of) HTTP-level auth like Bearer or Basic. Useful when your reverse proxy enforces mTLS (e.g. nginx `ssl_verify_client`, Traefik, Cloudflare Access). If your server just needs a Bearer token or Basic Auth, you don't need this.

Configure in **Settings -> Connection -> Authentication & Headers -> Client Certificate (mTLS)**.

## Setup

Two ways to provide a client certificate.

### Option A: pick from device certificates (recommended)

If your cert is already installed in Android's KeyChain (via Android Settings -> Encryption & credentials):

1. Open Colota -> Settings -> Connection -> Authentication & Headers -> **Client Certificate (mTLS)**
2. Tap **Pick from device certificates**
3. Android's system dialog appears. Select your cert.
4. The screen now shows the cert's subject, issuer and expiry date.

Colota only remembers which cert you picked - the cert itself stays where it already was on the phone.

### Option B: import a `.p12` file

If you have a PKCS12 file but the cert isn't installed at the OS level:

1. Move the `.p12` to your phone (any reasonably-secure transport works - syncthing, USB, etc.)
2. Open Colota -> Settings -> Connection -> Authentication & Headers -> **Client Certificate (mTLS)**
3. Tap **Import .p12 / .pfx**
4. Pick the file, enter the password (leave blank if none), tap **Save**
5. The screen now shows the cert's subject, issuer and expiry date

The new cert takes effect on the next sync request - no app restart needed. Same goes if you switch between Option A and Option B later.

Colota does not accept PEM client cert + PEM key as two separate files. Bundle them into a `.p12` first, or install via Android Settings and use the KeyChain picker.

Hostname verification is always on - the server's certificate must match the hostname or IP you connect to.

## Trust model

Colota's HTTPS trust anchors:

1. **System CAs** that ship with Android (Let's Encrypt, DigiCert, ISRG, Google Trust Services, etc.). Always applied.
2. **In-app imported CA** added through the Trusted Server CA section. One slot, trusted only by Colota.

Either anchor accepting the server's chain is enough - the two layers are additive.

User-installed device CAs (from Android Settings -> Encryption & credentials) are **not** honored, so malware or a coerced profile that plants a CA in the device store can't intercept Colota's sync.

### Trusting a private/internal server CA

If your server uses a publicly-trusted certificate (e.g. Let's Encrypt), there's nothing to do here. Otherwise:

- **Import in-app** - mTLS Settings -> **Trusted Server CA** -> Import CA (.crt / .pem). Trust is scoped to Colota; other apps on the phone are unaffected.
- **Or switch to a publicly-trusted cert** - Let's Encrypt is free and works for any public DNS name your server can prove ownership of.

## Testing the setup

In **Connection Settings**, set your endpoint to your `https://...` URL and tap **Test Connection**. Expected: `Connection successful` within a couple of seconds. Failure paths are distinguishable:

| Message | Likely cause | Fix |
| --- | --- | --- |
| `Server certificate is not trusted (self-signed or unknown CA)` | Your server's cert is signed by a CA Colota doesn't trust | Import the CA via mTLS Settings -> Trusted Server CA, or use a publicly-trusted cert |
| `Server requires a client certificate (mTLS) but none is configured` | Server demanded mTLS, Colota didn't send one | Import a `.p12` in the Client Certificate section |
| `Server rejected the client certificate` | Cert reached the server but was rejected | Wrong CA, expired cert, or revoked - check what your reverse proxy expects |
| `Incorrect password for client certificate` | The provided password doesn't unlock the `.p12` | Re-import with the correct password |
| `Hostname not verified` | Server cert is valid but doesn't list the hostname/IP you connected to | Reissue the server cert with a SAN that includes your hostname/IP |

## Lifecycle

### Where the cert lives

Once imported, the cert lives in the OS keystore - not in the app's regular settings, not on the filesystem in plain form and not in any backup.

- You don't need to remember the PKCS12 password. It's used during import and then discarded.
- If you picked a cert from the device certificates list, it survives an app reinstall.
- If you imported a `.p12`, uninstalling Colota removes it - re-import after reinstall.
- The Trusted Server CA is a public certificate, so it stays alongside the app's other settings.

### Removing

mTLS Settings -> Client Certificate section -> **Remove Certificate**. Same for Trusted Server CA -> **Remove CA**. The next sync request runs without mTLS.
