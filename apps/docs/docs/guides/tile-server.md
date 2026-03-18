---
sidebar_position: 6
---

# Map Tile Server

By default, Colota loads maps from [maps.mxd.codes](https://maps.mxd.codes) - a self-hosted tile server I run for this app. You can swap it out for your own if needed.

## Default Server

maps.mxd.codes runs [tileserver-gl](https://github.com/maptiler/tileserver-gl) on a netcup VPS. Two styles are served - bright for light mode, dark for dark mode.

**Technical details**

- Planet-wide `.mbtiles` sourced from [OpenFreeMap](https://openfreemap.org), downloaded and replaced weekly - OSM edits may take a few days to appear
- Styles are served as MapLibre GL style JSON at `/styles/bright/style.json` and `/styles/dark/style.json`
- Tile requests are rate-limited to 100 requests/second per IP (burst of 200). Normal app usage is well within this - panning and zooming typically generates 10-20 requests at a time
- Tile responses are cached at the server, so repeat views of the same area are served instantly
- IP addresses are not logged under normal operation. Logging may be enabled temporarily if there is a specific reason such as investigating abuse or server issues, and disabled again afterwards

Free to use. Normal usage means map tiles loading as you pan and zoom within the app, and downloading offline map packs through the built-in offline maps feature. Accessing the tile server directly, bulk-downloading tiles programmatically, or scraping outside the app falls outside of this and is not permitted.

If the default server is unavailable or you run into issues, you can either configure a custom tile server (see below) or open an issue on [GitHub](https://github.com/dietrichmax/colota/issues).

:::tip Support the server If you find Colota useful and want to help keep the default server running, contributions are welcome - the hosting runs at 17,94€/month. [mxd.codes/support](https://mxd.codes/support)

:::

## Using a Custom Server

:::note Offline maps Offline map packs are downloaded from whichever tile server is configured at the time. Switching to a custom server won't affect packs you've already downloaded, but new downloads will come from the new server.

:::

1. Open **Settings**
2. Scroll to **Appearance** and tap **Map Tile Server**
3. Enter your style JSON URLs for light and dark mode
4. Leave a field empty to fall back to the default

Any [MapLibre GL style](https://maplibre.org/maplibre-style-spec/) endpoint works. If you only have one style, use the same URL in both fields.

:::note attribution

when using the default server, the map shows mxd.codes · OpenMapTiles · OpenStreetMap attribution. when a custom server is configured, attribution is read automatically from the style JSON served by your tile server.

:::

**self-hosting options**

- [tileserver-gl](https://tileserver.readthedocs.io) - serves MapLibre styles from `.mbtiles` files.
- [PMTiles](https://docs.protomaps.com/pmtiles/) - a single static file format that can be served from any object storage (S3, Cloudflare R2, etc.) with no server process required.

**free hosted alternatives**

[OpenFreeMap](https://openfreemap.org) is a good free alternative. Available styles:

| style           | URL                                            |
| --------------- | ---------------------------------------------- |
| bright (light)  | `https://tiles.openfreemap.org/styles/bright`  |
| liberty (light) | `https://tiles.openfreemap.org/styles/liberty` |
| fiord (dark)    | `https://tiles.openfreemap.org/styles/fiord`   |

For a light/dark pair, use `bright` or `liberty` for light mode and `fiord` for dark mode.
