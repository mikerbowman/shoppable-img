# Shoppable Image Widget

Turn any image into a clickable, "shoppable" image for embedding in
WordPress posts (or any site). Drop up to 6 pulsing, colored nodes onto
an image, point each one at a product URL, and get a copy-paste embed
snippet — no database, no backend required for the widget itself.

## Folder layout

- `runtime/shoppable-image.js` — the widget that actually renders on your
  site. This is the *only* file that needs to be reachable from WordPress.
- `builder/` — the tool you use locally (or host anywhere) to build a
  shoppable image and generate its embed code.
- `proxy/` — an optional Cloudflare Worker that auto-fetches product
  name/price from a URL (reads Open Graph tags / JSON-LD `Product` schema).
  Only needed for the "Auto-fetch name & price" button.
- `test-embed.html` — a static page that pastes a generated snippet in,
  simulating what a WordPress Custom HTML block would render.

## Running the builder locally

Any static file server works. Example with Python:

```
python -m http.server 8765
```

Then open `http://localhost:8765/builder/index.html`.

## Using it

1. Paste an image URL, click **Load image**.
2. Click on the image to drop a node (max 6). Drag a node to reposition it.
3. Pick a color, paste the product URL, and either fill in name/price
   manually or click **Auto-fetch name & price** (requires the proxy,
   see below).
4. Click **Generate embed code**, copy it, paste into a WordPress
   "Custom HTML" block.

## Going live

### 1. Host `runtime/shoppable-image.js`

Once this repo is pushed to GitHub, the easiest free option is jsDelivr,
which serves any file straight from a GitHub repo:

```
https://cdn.jsdelivr.net/gh/<your-username>/<repo>@main/runtime/shoppable-image.js
```

Paste that URL into the builder's **Settings → Runtime script URL** field
(it's saved in your browser so you only set it once). It'll then be used
in every generated embed snippet.

Alternative: upload `shoppable-image.js` to your WordPress media library
or theme files and reference that URL instead — works exactly the same.

### 2. Deploy the auto-fetch proxy (optional)

The proxy is a single-file Cloudflare Worker (free tier covers this
easily):

```
cd proxy
npm install -g wrangler   # one-time
wrangler login            # one-time, opens a browser to authorize
wrangler deploy
```

Wrangler will print your live URL, e.g. `https://shoppable-image-proxy.<you>.workers.dev`.
Paste that into the builder's **Settings → Auto-fetch proxy URL** field.

### 3. Host the builder itself (optional)

You don't strictly need to host the builder anywhere public — you can
just run it locally whenever you want to create a new shoppable image.
If you'd rather have it live (e.g. to use from another computer),
GitHub Pages works: enable Pages on the repo, serve from `/builder`.

## Notes

- Embeds are fully self-contained: all node data lives in the
  `data-shoppable` JSON attribute on the page. Editing an existing
  shoppable image means reopening the builder, recreating the nodes,
  and re-pasting the new snippet.
- Max 6 nodes per image is enforced in the builder UI and the runtime
  script both.
