# Shoppable Image Widget

An embeddable widget that turns any image into a "shoppable image" — up to 6
pulsing, colored, clickable nodes placed on an image, each linking to a
product page. Built for embedding in WordPress and Shopify blog posts as a
marketing tool. Built collaboratively with Claude Code, vibe-coding style,
across several sessions.

## Live deployment

- **Builder tool** (public, anyone can use, no login): https://mikerbowman.github.io/shoppable-img/builder/index.html
- **GitHub repo**: https://github.com/mikerbowman/shoppable-img (public)
- **Runtime widget script** (served via jsDelivr from the repo): https://cdn.jsdelivr.net/gh/mikerbowman/shoppable-img@main/runtime/shoppable-image.js
- **Metadata + image-hosting proxy** (Cloudflare Worker): https://shoppable-image-proxy.mikerbowman.workers.dev
  - Cloudflare account subdomain: `mikerbowman.workers.dev`
  - R2 bucket backing image uploads: `shoppable-image-uploads`

## Architecture — 3 pieces

1. **`runtime/shoppable-image.js`** — the only file that needs to be reachable
   from WordPress/Shopify. A small vanilla-JS/CSS widget with no dependencies.
   Reads a `.shoppable-image` div's `data-shoppable` JSON attribute and renders
   the image plus positioned nodes: each node is a hollow colored ring with an
   expanding/fading "ping" pulse (no fill, no border, no number — deliberately
   styled to look like a premium map-pin/location marker, not a game-board
   token). Hover/tap shows a tooltip with product name + price; clicking opens
   the product URL. Exposes `window.ShoppableImage.init()` for the builder's
   own live preview to reuse the exact same rendering code.

2. **`builder/`** (`index.html` + `builder.js` + `builder.css`) — the GUI you
   use to actually build a shoppable image: paste or upload an image, click to
   place up to 6 nodes (drag to reposition, click a node in the sidebar list
   or on the canvas to re-edit it, "+ Add node" button), pick a hex color per
   node, set a product URL/name/price (or auto-fetch name+price from the URL),
   then "Generate embed code" produces the final `<div>` + `<script>` snippet
   to paste into a WordPress "Custom HTML" block or Shopify's blog HTML editor.

   The builder's Settings panel has two URL fields (Runtime script URL,
   Auto-fetch proxy URL) that default to the live URLs above via
   `DEFAULT_RUNTIME_URL` / `DEFAULT_PROXY_URL` constants in `builder.js` — this
   is what makes the hosted builder "just work" for anyone who opens the link,
   with no configuration. Values are also cached per-browser in `localStorage`
   if a user overrides them.

3. **`proxy/worker.js`** (Cloudflare Worker) — does two unrelated jobs on one
   Worker, routed by path:
   - `GET /?url=<product page>` — fetches the page server-side (avoids browser
     CORS) and extracts product name/price/image via `HTMLRewriter`, checking
     JSON-LD `Product` schema first, then falling back to Open Graph meta tags.
     This is what powers the "Auto-fetch name & price" button.
   - `POST /upload` (body = raw image bytes, `Content-Type: image/*`) — stores
     the image in the `UPLOADS` R2 bucket under a random UUID key, returns
     `{url: ".../images/<uuid>.ext"}`.
   - `GET /images/<key>` — serves an uploaded image back out of R2 with a
     1-year immutable cache header.

## Why images are hosted, not inlined (important design decision)

Embeds are otherwise fully self-contained: node positions/colors/URLs/names/
prices are baked directly into the `data-shoppable` JSON attribute — no
database, no lookup by ID. Early versions did the same for the **image** too:
an uploaded photo became a base64 `data:` URI baked into that same JSON.

This broke on Shopify: Shopify truncates blog post HTML past roughly 60,000
characters, and a base64-encoded photo alone can easily exceed that, silently
eating everything in the post below the embed. So uploaded images now go
through the Worker's `/upload` → R2 → short URL path instead, keeping the
embed itself tiny (typically a few hundred characters) regardless of image
size. The base64 `data:` URI path still exists as a fallback (if no proxy URL
is configured, or if the upload request fails) so users are never fully
blocked — but it comes with a loud on-screen warning, and `builder.js` also
warns at generate-time if the final embed exceeds ~55K characters as a second
safety net.

Pasted image *URLs* (as opposed to uploads) were never a problem — they're
already just a short link, same as a product URL.

## How a user actually uses this

1. Open the builder link, paste an image URL or upload a photo.
2. Click on the image to drop nodes (max 6); drag to reposition; click the
   sidebar list or an existing node to go back and edit it.
3. Pick a color, set the product URL, click "Auto-fetch name & price" (or
   type it manually).
4. Click "Generate embed code," copy it, paste into a WordPress Custom HTML
   block or Shopify blog post's HTML editor.

No account, no login, no install — the hosted builder link is meant to be
shared with anyone (teammates, clients) who wants to create these.

## Local development

- Everything is plain HTML/CSS/vanilla JS — no build step, no framework.
- Serve locally with any static file server, e.g. `python -m http.server 8765`
  from the repo root, then open `http://localhost:8765/builder/index.html`.
- `proxy/` is a Cloudflare Worker — deploy changes with `wrangler deploy` from
  inside that folder (requires Node.js + `npm install -g wrangler` +
  `wrangler login` once). `proxy/wrangler.toml` has the R2 binding
  (`UPLOADS` → `shoppable-image-uploads`).
- `test-embed.html` / `test-embed-live-cdn.html` / `test-product-fixture.html`
  at the repo root are manual test fixtures, not part of the shipped product.

## Known gotchas (learned the hard way)

- **GitHub Pages propagation is unpredictably slow for this repo/account** —
  we've seen pushes take 10+ minutes to actually go live on the
  `mikerbowman.github.io` builder URL, well beyond GitHub's typical minute-ish
  turnaround. Added `.nojekyll` at the repo root to stop unnecessary Jekyll
  processing on a plain static site, which should help, but always verify a
  fresh push is actually live (fetch the file directly, check for the new
  code) before telling anyone a change has shipped.
- **jsDelivr propagates much faster** than GitHub Pages for the same repo —
  when something needs to be live quickly for testing, prefer
  `cdn.jsdelivr.net/gh/mikerbowman/shoppable-img@main/...` over the Pages URL.
- **Cloudflare's dashboard was broken for this account** for both the
  `workers.dev` subdomain setup (silently 404ing, no onboarding prompt
  appeared even across browsers) and had a non-interactive Deploy button on
  the "Create a Worker" wizard. Worked around entirely via `wrangler` CLI +
  one direct Cloudflare API call (`PUT /accounts/:id/workers/subdomain`) using
  the OAuth token wrangler stores at
  `%APPDATA%\xdg.config\.wrangler\config\default.toml` after `wrangler login`.
  R2, by contrast, genuinely does require a one-time manual "enable" click in
  the dashboard (that part worked fine) before `wrangler r2 bucket create`
  will succeed.
- **Browser test-session caching**: repeatedly using a `fetch(..., {cache:
  "no-store"}).then(eval)` trick to force-load fresh JS into an already-open
  test tab (to work around aggressive script caching) leaves the *old*
  version's event listeners still attached underneath. Stacking several of
  these across a long testing session causes confusing double-fires and stale
  state reads. If a test result looks inexplicable, fully restart the preview
  server/tab for a clean single instance before debugging further.
