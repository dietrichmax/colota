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

:::tip Support the server

If you find Colota useful and want to help keep the default server running, contributions are welcome - the hosting runs at 17,94€/month. [mxd.codes/support](https://mxd.codes/support)

:::

## Using a Custom Server

:::note Offline maps

Offline map packs are downloaded from whichever tile server is configured at the time. Switching to a custom server won't affect packs you've already downloaded, but new downloads will come from the new server.

:::

1. Open **Settings**
2. Scroll to **Appearance** and tap **Map Tile Server**
3. Enter your style JSON URLs for light and dark mode
4. Leave a field empty to fall back to the default

Any [MapLibre GL style](https://maplibre.org/maplibre-style-spec/) endpoint works. If you only have one style, use the same URL in both fields.

**Free hosted alternatives**

[OpenFreeMap](https://openfreemap.org) is a good free alternative. Available styles:

| style           | URL                                            |
| --------------- | ---------------------------------------------- |
| bright (light)  | `https://tiles.openfreemap.org/styles/bright`  |
| liberty (light) | `https://tiles.openfreemap.org/styles/liberty` |
| fiord (dark)    | `https://tiles.openfreemap.org/styles/fiord`   |

For a light/dark pair, use `bright` or `liberty` for light mode and `fiord` for dark mode.

:::note Attribution

When using the default server, the map shows **© OpenMapTiles · © OpenStreetMap contributors · © maps.mxd.codes** attribution. When a custom server is configured, attribution is read automatically from the style JSON served by your tile server.

:::

## Self-hosting tileserver-gl

Setting up your own map tile server is straightforward. You need a server, an `.mbtiles` file and Docker.

### Requirements

- A Linux server (VPS or bare metal) with Docker installed
- At least 4 GB RAM and 250+ GB disk space (planet-wide mbtiles are ~80-100 GB)
- A domain name (optional but recommended for HTTPS)

### 1. Download map tiles

[OpenFreeMap](https://openfreemap.org) provides free planet-wide `.mbtiles` files updated weekly. Check their [index file](https://btrfs.openfreemap.com/files.txt) for the latest version, then download:

```bash
mkdir -p /opt/tileserver/data
cd /opt/tileserver/data

# Replace VERSION with the latest from the index file (e.g. 20260320_6)
wget https://btrfs.openfreemap.com/areas/planet/VERSION/tiles.mbtiles
# e.g. wget https://btrfs.openfreemap.com/areas/monaco/20260324_231001_pt/tiles.mbtiles
```

The planet mbtiles file is ~80-100 GB and may take a while depending on your connection.

### 2. Add map styles

tileserver-gl needs style JSON files, fonts and sprites to render tiles. The [OpenFreeMap styles](https://github.com/hyperknot/openfreemap-styles) are actively maintained forks of the original [OpenMapTiles](https://openmaptiles.org/) styles:

- **Bright** - clean, bright style (light mode)
- **Dark** - dark style (dark mode)
- **Liberty** - community-maintained style (light mode)
- **Positron** - minimal light style
- **Fiord** - muted dark style

#### Download styles

```bash
cd /opt/tileserver
git clone https://github.com/hyperknot/openfreemap-styles.git

# Copy the styles you want into a clean structure
mkdir -p styles/bright styles/dark
cp openfreemap-styles/styles/bright/style.json styles/bright/
cp openfreemap-styles/styles/dark/style.json styles/dark/
```

#### Download fonts

The styles use Noto Sans fonts. Download pre-built PBF font files from [openmaptiles/fonts](https://github.com/openmaptiles/fonts):

```bash
apt install -y unzip
cd /opt/tileserver
wget https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-sans.zip
unzip noto-sans.zip -d fonts
rm noto-sans.zip
```

This creates the font directories tileserver-gl expects (e.g. `fonts/Noto Sans Regular/`, `fonts/Noto Sans Bold/`).

#### Download sprites

Sprites (map icons like parks, restaurants, etc.) are included in the OpenFreeMap styles repo:

```bash
cp -r openfreemap-styles/sprites/sprites/ofm_f384 sprites
```

You can remove the cloned repo afterwards:

```bash
rm -rf openfreemap-styles
```

Your directory structure should now look like this:

```
/opt/tileserver/
  config.json
  data/
    tiles.mbtiles
  styles/
    bright/
      style.json
    dark/
      style.json
  fonts/
    Noto Sans Bold/
    Noto Sans Italic/
    Noto Sans Regular/
  sprites/
    ofm_f384/
      ofm.json
      ofm.png
      ofm@2x.json
      ofm@2x.png
```

#### Edit the style JSON files

The styles use `__TILEJSON_DOMAIN__` placeholders that need to be replaced with local paths. Run these commands from `/opt/tileserver/` to update all references at once:

```bash
cd /opt/tileserver

# Point tile source to local mbtiles
sed -i 's|"url": "https://__TILEJSON_DOMAIN__/planet"|"url": "mbtiles://{planet}"|g' \
  styles/bright/style.json styles/dark/style.json

# Point glyphs to local fonts
sed -i 's|"glyphs": "https://__TILEJSON_DOMAIN__/fonts/{fontstack}/{range}.pbf"|"glyphs": "{fontstack}/{range}.pbf"|g' \
  styles/bright/style.json styles/dark/style.json

# Point sprites to local files
sed -i 's|"sprite": "https://__TILEJSON_DOMAIN__/sprites/ofm_f384/ofm"|"sprite": "sprites/ofm_f384/ofm"|g' \
  styles/bright/style.json styles/dark/style.json

# Remove unused ne2_shaded raster source
python3 -c "
import json
for f in ['styles/bright/style.json', 'styles/dark/style.json']:
    with open(f) as fh: d = json.load(fh)
    d['sources'].pop('ne2_shaded', None)
    with open(f, 'w') as fh: json.dump(d, fh, indent=2)
"
```

The `{planet}` name in the tile source must match the key in the `data` section of `config.json` (see below). After these changes, all styles reference local files only - you can customize the style JSONs freely without depending on any remote service.

#### Create the tileserver-gl config

Create the `config.json`:

```bash
cat > /opt/tileserver/config.json << 'EOF'
{
  "options": {
    "paths": {
      "styles": "/styles",
      "fonts": "/fonts",
      "sprites": "/sprites",
      "mbtiles": "/data"
    }
  },
  "data": {
    "planet": {
      "mbtiles": "tiles.mbtiles"
    }
  },
  "styles": {
    "bright": {
      "style": "/styles/bright/style.json"
    },
    "dark": {
      "style": "/styles/dark/style.json"
    }
  }
}
EOF
```

### 3. Start tileserver-gl

```bash
docker run -d \
  --name tileserver \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /opt/tileserver/data:/data \
  -v /opt/tileserver/styles:/styles \
  -v /opt/tileserver/fonts:/fonts \
  -v /opt/tileserver/sprites:/sprites \
  -v /opt/tileserver/config.json:/config.json \
  maptiler/tileserver-gl \
  --config /config.json
```

Your tile server is now running at `http://your-server:8080`. Open it in a browser to see the available styles and a preview map.

### 3. Set up a reverse proxy (recommended)

Use nginx to add HTTPS, caching and rate limiting. Install nginx and create a config:

```nginx
proxy_cache_path /var/cache/nginx/tiles levels=1:2 keys_zone=tiles:100m
                 max_size=10g inactive=7d use_temp_path=off;

server {
    listen 443 ssl http2;
    server_name tiles.example.com;

    ssl_certificate     /etc/letsencrypt/live/tiles.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tiles.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_cache tiles;
        proxy_cache_valid 200 7d;
        proxy_cache_use_stale error timeout updating;
        add_header X-Cache-Status $upstream_cache_status;
    }
}
```

With caching enabled, most tile requests are served directly from nginx without hitting tileserver-gl.

### 4. Connect Colota

1. Open **Settings** in Colota
2. Scroll to **Appearance** and tap **Map Tile Server**
3. Enter your style URLs:
   - Light: `https://tiles.example.com/styles/bright/style.json`
   - Dark: `https://tiles.example.com/styles/dark/style.json`

The available style names depend on your tileserver-gl configuration. Visit your server's root URL to see which styles are served.

### Updating tiles

To update your map tiles, find the latest version from the [index file](https://btrfs.openfreemap.com/files.txt), then download and swap:

```bash
cd /opt/tileserver/data

# Find the latest planet version
LATEST=$(curl -s https://btrfs.openfreemap.com/files.txt | grep 'areas/planet' | grep '.mbtiles' | tail -1 | sed 's|.*areas/planet/||;s|/tiles.mbtiles||')

# Download and replace
wget -O tiles-new.mbtiles "https://btrfs.openfreemap.com/areas/planet/${LATEST}/tiles.mbtiles"
mv tiles-new.mbtiles tiles.mbtiles
docker restart tileserver
```

You can automate this with a weekly cron job.

### Other self-hosting options

- [OpenFreeMap self-hosting](https://github.com/hyperknot/openfreemap/blob/main/docs/self_hosting.md) - serves tiles directly from Btrfs partition images via nginx, no tile server process needed. Higher performance than tileserver-gl but requires a dedicated clean Ubuntu server and more setup.
- [PMTiles](https://docs.protomaps.com/pmtiles/) - a single static file format that can be served from any object storage (S3, Cloudflare R2, etc.) with no server process required.
