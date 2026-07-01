/*!
 * Shoppable Image runtime widget.
 * Renders pulsing, clickable product nodes on top of an image from a
 * self-contained JSON config (no backend calls, no cookies, no tracking).
 *
 * Usage:
 *   <div class="shoppable-image" data-shoppable='{"image":"...","nodes":[...]}'></div>
 *   <script src="shoppable-image.js" defer></script>
 */
(function () {
  "use strict";

  var STYLE_ID = "si-widget-styles";
  var INIT_ATTR = "data-si-initialized";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".si-widget{position:relative;display:inline-block;max-width:100%;line-height:0;}",
      ".si-widget img{display:block;width:100%;height:auto;border-radius:4px;}",
      ".si-node{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;",
      "  display:block;text-decoration:none;cursor:pointer;z-index:2;}",
      ".si-node-dot{position:absolute;top:50%;left:50%;width:14px;height:14px;",
      "  transform:translate(-50%,-50%);border-radius:50%;background:transparent;",
      "  border:2px solid;box-shadow:0 1px 3px rgba(0,0,0,.35);}",
      ".si-node-ping{position:absolute;top:50%;left:50%;width:14px;height:14px;",
      "  transform:translate(-50%,-50%);border-radius:50%;background:transparent;",
      "  border:2px solid;opacity:.7;",
      "  animation:si-pulse 1.8s ease-out infinite;}",
      "@keyframes si-pulse{0%{transform:translate(-50%,-50%) scale(1);opacity:.7;}",
      "  100%{transform:translate(-50%,-50%) scale(2.4);opacity:0;}}",
      ".si-tooltip{position:absolute;bottom:calc(100% + 10px);left:50%;",
      "  transform:translateX(-50%) translateY(4px);min-width:120px;max-width:220px;",
      "  background:#111;color:#fff;padding:8px 10px;border-radius:6px;font:13px/1.35 -apple-system,",
      "  BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;text-align:left;pointer-events:none;",
      "  opacity:0;visibility:hidden;transition:opacity .15s ease,transform .15s ease;z-index:3;",
      "  white-space:normal;box-shadow:0 4px 14px rgba(0,0,0,.25);}",
      ".si-tooltip:after{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);",
      "  border:6px solid transparent;border-top-color:#111;}",
      ".si-tooltip .si-name{font-weight:600;display:block;margin-bottom:2px;}",
      ".si-tooltip .si-price{opacity:.85;display:block;}",
      ".si-node:hover .si-tooltip,.si-node.si-tooltip-open .si-tooltip{opacity:1;visibility:visible;",
      "  transform:translateX(-50%) translateY(0);}",
      ".si-node:focus-visible .si-node-dot{outline:2px solid #fff;outline-offset:2px;}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function buildNode(node) {
    var a = document.createElement("a");
    a.className = "si-node";
    a.href = node.url || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer sponsored";
    a.style.left = clamp(parseFloat(node.x) || 0, 0, 100) + "%";
    a.style.top = clamp(parseFloat(node.y) || 0, 0, 100) + "%";
    a.setAttribute("aria-label", [node.name, node.price].filter(Boolean).join(", "));

    var color = node.color || "#ff3b30";

    var ping = document.createElement("span");
    ping.className = "si-node-ping";
    ping.style.borderColor = color;
    ping.setAttribute("aria-hidden", "true");

    var dot = document.createElement("span");
    dot.className = "si-node-dot";
    dot.style.borderColor = color;
    dot.setAttribute("aria-hidden", "true");

    var tooltip = document.createElement("span");
    tooltip.className = "si-tooltip";
    if (node.name) {
      var nameEl = document.createElement("span");
      nameEl.className = "si-name";
      nameEl.textContent = node.name;
      tooltip.appendChild(nameEl);
    }
    if (node.price) {
      var priceEl = document.createElement("span");
      priceEl.className = "si-price";
      priceEl.textContent = node.price;
      tooltip.appendChild(priceEl);
    }

    a.appendChild(ping);
    a.appendChild(dot);
    if (node.name || node.price) a.appendChild(tooltip);

    // Touch devices: tap toggles the tooltip instead of relying on :hover.
    a.addEventListener("touchstart", function (e) {
      if (!a.classList.contains("si-tooltip-open")) {
        e.preventDefault();
        document.querySelectorAll(".si-tooltip-open").forEach(function (el) {
          el.classList.remove("si-tooltip-open");
        });
        a.classList.add("si-tooltip-open");
      }
    }, { passive: false });

    return a;
  }

  function init(container) {
    if (container.getAttribute(INIT_ATTR)) return;

    var raw = container.getAttribute("data-shoppable");
    if (!raw) return;

    var config;
    try {
      config = JSON.parse(raw);
    } catch (err) {
      console.error("[shoppable-image] invalid data-shoppable JSON", err);
      return;
    }
    if (!config.image) return;

    container.setAttribute(INIT_ATTR, "true");
    container.classList.add("si-widget");

    var img = document.createElement("img");
    img.src = config.image;
    img.alt = config.alt || "";
    img.loading = "lazy";
    container.appendChild(img);

    (config.nodes || []).slice(0, 6).forEach(function (node) {
      container.appendChild(buildNode(node));
    });
  }

  function initAll() {
    injectStyles();
    var containers = document.querySelectorAll(".shoppable-image[data-shoppable]");
    containers.forEach(init);
  }

  // Dismiss any tap-opened tooltip when tapping elsewhere.
  document.addEventListener("touchstart", function (e) {
    if (!e.target.closest(".si-node")) {
      document.querySelectorAll(".si-tooltip-open").forEach(function (el) {
        el.classList.remove("si-tooltip-open");
      });
    }
  }, { passive: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }

  // Exposed so the builder's live preview can re-render on the fly.
  window.ShoppableImage = { init: init, initAll: initAll };
})();
