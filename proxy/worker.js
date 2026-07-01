/*!
 * Shoppable Image metadata proxy — Cloudflare Worker.
 *
 * Fetches a product page server-side (avoids browser CORS restrictions),
 * and extracts product name / price / image from Open Graph meta tags
 * and JSON-LD Product schema, which is what Shopify, WooCommerce,
 * BigCommerce, etc. all emit by default.
 *
 * Usage:  GET https://your-worker.workers.dev/?url=<encoded product URL>
 * Deploy: wrangler deploy   (see README in this folder)
 */

const CURRENCY_SYMBOLS = {
  USD: "$", CAD: "$", AUD: "$", NZD: "$",
  GBP: "£", EUR: "€", JPY: "¥"
};

function formatPrice(amount, currency) {
  if (!amount) return "";
  const symbol = currency ? CURRENCY_SYMBOLS[currency.toUpperCase()] : "";
  return symbol ? symbol + amount : currency ? `${amount} ${currency}` : `${amount}`;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

// Pulls the first JSON-LD block whose @type is (or includes) "Product".
function findProductFromJsonLd(blocks) {
  for (const raw of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed["@graph"]) ? parsed["@graph"]
      : [parsed];

    for (const item of candidates) {
      const type = item["@type"];
      const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
      if (!isProduct) continue;

      const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      return {
        name: item.name || "",
        image: Array.isArray(item.image) ? item.image[0] : item.image || "",
        price: offers ? formatPrice(offers.price || offers.lowPrice, offers.priceCurrency) : ""
      };
    }
  }
  return null;
}

async function extractMetadata(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ShoppableImageBot/1.0; +https://github.com/)",
      "Accept": "text/html"
    },
    redirect: "follow"
  });

  if (!res.ok) throw new Error(`Upstream returned ${res.status}`);

  const meta = {};
  const jsonLdBlocks = [];
  let jsonLdBuffer = "";
  let inJsonLd = false;

  const rewriter = new HTMLRewriter()
    .on('meta[property="og:title"]', { element: (el) => { meta.ogTitle = el.getAttribute("content"); } })
    .on('meta[property="og:image"]', { element: (el) => { meta.ogImage = el.getAttribute("content"); } })
    .on('meta[property="og:price:amount"]', { element: (el) => { meta.ogPriceAmount = el.getAttribute("content"); } })
    .on('meta[property="og:price:currency"]', { element: (el) => { meta.ogPriceCurrency = el.getAttribute("content"); } })
    .on('meta[property="product:price:amount"]', { element: (el) => { meta.productPriceAmount = el.getAttribute("content"); } })
    .on('meta[property="product:price:currency"]', { element: (el) => { meta.productPriceCurrency = el.getAttribute("content"); } })
    .on('title', { text: (t) => { meta.title = (meta.title || "") + t.text; } })
    .on('script[type="application/ld+json"]', {
      element() { inJsonLd = true; jsonLdBuffer = ""; },
      text(t) {
        if (!inJsonLd) return;
        jsonLdBuffer += t.text;
        if (t.lastInTextNode) {
          jsonLdBlocks.push(jsonLdBuffer);
          inJsonLd = false;
        }
      }
    });

  // HTMLRewriter parses lazily as the body is consumed.
  await rewriter.transform(res).arrayBuffer();

  const fromJsonLd = findProductFromJsonLd(jsonLdBlocks) || {};

  const amount = meta.productPriceAmount || meta.ogPriceAmount;
  const currency = meta.productPriceCurrency || meta.ogPriceCurrency;

  return {
    name: fromJsonLd.name || meta.ogTitle || (meta.title || "").trim(),
    price: fromJsonLd.price || (amount ? formatPrice(amount, currency) : ""),
    image: fromJsonLd.image || meta.ogImage || ""
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return jsonResponse({ error: "Missing ?url= parameter" }, 400);
    }
    try {
      new URL(target);
    } catch {
      return jsonResponse({ error: "Invalid URL" }, 400);
    }

    try {
      const data = await extractMetadata(target);
      return jsonResponse(data);
    } catch (err) {
      return jsonResponse({ error: "Failed to fetch or parse product page", detail: String(err) }, 502);
    }
  }
};
