<p align="center">
  <img src="banner.svg" width="100%" alt="colota-forwarder" />
</p>

# colota-forwarder

[![Shield: Docker Pulls](https://img.shields.io/docker/pulls/mxdcodes/colota-forwarder?label=Docker%20Pull)](https://hub.docker.com/r/mxdcodes/colota-forwarder) ![Shield: Docker Image Size](https://img.shields.io/docker/image-size/mxdcodes/colota-forwarder/latest?label=Image%20Size) [![Build](https://github.com/dietrichmax/colota/actions/workflows/forwarder-publish.yml/badge.svg)](https://github.com/dietrichmax/colota/actions/workflows/forwarder-publish.yml)

Receives location updates from the [Colota](https://colota.app) app or the OwnTracks app and forwards each one to several backends at once, such as Home Assistant, Dawarich, GeoPulse, Traccar, Reitti or any HTTP endpoint, converting the format for each.

**Documentation:** [Setup](https://colota.app/docs/integrations/forwarder) · [Reference](https://colota.app/docs/integrations/forwarder-reference)

`compose.yml` in this folder is a ready-to-use example.

## Development

The forwarder is not an npm workspace. Run everything from this folder:

```sh
npm ci
npm run dev     # restarts on changes to src/ and .env
npm run check   # audit, format, typecheck, test, build
```

## License

[AGPL-3.0-or-later](LICENSE)
