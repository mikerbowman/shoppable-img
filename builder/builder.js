(function () {
  "use strict";

  var MAX_NODES = 6;
  var LS_RUNTIME_URL = "si_builder_runtime_url";
  var LS_PROXY_URL = "si_builder_proxy_url";

  var state = {
    imageUrl: "",
    nodes: [],
    selectedIndex: -1,
    dragIndex: -1
  };

  var els = {
    imageUrlInput: document.getElementById("imageUrlInput"),
    loadImageBtn: document.getElementById("loadImageBtn"),
    canvasWrap: document.getElementById("canvasWrap"),
    emptyState: document.getElementById("emptyState"),
    stage: document.getElementById("stage"),
    stageImg: document.getElementById("stageImg"),
    nodeCount: document.getElementById("nodeCount"),
    editor: document.getElementById("editor"),
    editorIndex: document.getElementById("editorIndex"),
    nodeColor: document.getElementById("nodeColor"),
    nodeUrl: document.getElementById("nodeUrl"),
    nodeName: document.getElementById("nodeName"),
    nodePrice: document.getElementById("nodePrice"),
    autoFetchBtn: document.getElementById("autoFetchBtn"),
    autoFetchStatus: document.getElementById("autoFetchStatus"),
    deleteNodeBtn: document.getElementById("deleteNodeBtn"),
    runtimeUrlInput: document.getElementById("runtimeUrlInput"),
    proxyUrlInput: document.getElementById("proxyUrlInput"),
    generateBtn: document.getElementById("generateBtn"),
    outputWrap: document.getElementById("outputWrap"),
    outputCode: document.getElementById("outputCode"),
    copyBtn: document.getElementById("copyBtn")
  };

  // ---------- settings persistence ----------
  els.runtimeUrlInput.value = localStorage.getItem(LS_RUNTIME_URL) || "";
  els.proxyUrlInput.value = localStorage.getItem(LS_PROXY_URL) || "";
  els.runtimeUrlInput.addEventListener("input", function () {
    localStorage.setItem(LS_RUNTIME_URL, els.runtimeUrlInput.value.trim());
  });
  els.proxyUrlInput.addEventListener("input", function () {
    localStorage.setItem(LS_PROXY_URL, els.proxyUrlInput.value.trim());
  });

  // ---------- image loading ----------
  function loadImage(url) {
    if (!url) return;
    els.stageImg.onload = function () {
      state.imageUrl = url;
      state.nodes = [];
      state.selectedIndex = -1;
      els.canvasWrap.hidden = false;
      els.emptyState.hidden = true;
      renderNodes();
      updateGenerateBtn();
      hideEditor();
    };
    els.stageImg.onerror = function () {
      alert("Could not load that image URL. Check it's a direct link to an image and allows hotlinking.");
    };
    els.stageImg.src = url;
  }

  els.loadImageBtn.addEventListener("click", function () {
    loadImage(els.imageUrlInput.value.trim());
  });
  els.imageUrlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") loadImage(els.imageUrlInput.value.trim());
  });

  // ---------- node placement ----------
  els.stage.addEventListener("click", function (e) {
    if (e.target.closest(".editor-node")) return; // handled separately
    if (state.nodes.length >= MAX_NODES) {
      flashStatus("Maximum of 6 nodes reached.");
      return;
    }
    var rect = els.stage.getBoundingClientRect();
    var xPct = ((e.clientX - rect.left) / rect.width) * 100;
    var yPct = ((e.clientY - rect.top) / rect.height) * 100;
    addNode(xPct, yPct);
  });

  function addNode(xPct, yPct) {
    var node = {
      x: clamp(xPct), y: clamp(yPct),
      color: "#ff3b30", url: "", name: "", price: ""
    };
    state.nodes.push(node);
    renderNodes();
    selectNode(state.nodes.length - 1);
    updateGenerateBtn();
  }

  function clamp(n) { return Math.min(100, Math.max(0, n)); }

  // ---------- rendering the editable nodes on the stage ----------
  function renderNodes() {
    Array.from(els.stage.querySelectorAll(".editor-node")).forEach(function (el) { el.remove(); });

    state.nodes.forEach(function (node, i) {
      var el = document.createElement("div");
      el.className = "editor-node" + (i === state.selectedIndex ? " selected" : "");
      el.style.left = node.x + "%";
      el.style.top = node.y + "%";
      el.style.background = node.color;
      el.textContent = String(i + 1);
      el.dataset.index = String(i);

      el.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        selectNode(i);
        startDrag(i, el, e);
      });

      els.stage.appendChild(el);
    });

    els.nodeCount.textContent = String(state.nodes.length);
  }

  function startDrag(index, el, downEvent) {
    state.dragIndex = index;
    el.classList.add("dragging");
    el.setPointerCapture(downEvent.pointerId);

    function onMove(e) {
      var rect = els.stage.getBoundingClientRect();
      var xPct = clamp(((e.clientX - rect.left) / rect.width) * 100);
      var yPct = clamp(((e.clientY - rect.top) / rect.height) * 100);
      state.nodes[index].x = xPct;
      state.nodes[index].y = yPct;
      el.style.left = xPct + "%";
      el.style.top = yPct + "%";
    }
    function onUp(e) {
      el.classList.remove("dragging");
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      state.dragIndex = -1;
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  // ---------- node editor panel ----------
  function selectNode(index) {
    state.selectedIndex = index;
    renderNodes();
    var node = state.nodes[index];
    els.editor.hidden = false;
    els.editorIndex.textContent = String(index + 1);
    els.nodeColor.value = node.color;
    els.nodeUrl.value = node.url;
    els.nodeName.value = node.name;
    els.nodePrice.value = node.price;
    setStatus("");
  }

  function hideEditor() {
    state.selectedIndex = -1;
    els.editor.hidden = true;
  }

  function currentNode() {
    return state.selectedIndex >= 0 ? state.nodes[state.selectedIndex] : null;
  }

  [["nodeColor", "color"], ["nodeUrl", "url"], ["nodeName", "name"], ["nodePrice", "price"]]
    .forEach(function (pair) {
      els[pair[0]].addEventListener("input", function () {
        var node = currentNode();
        if (!node) return;
        node[pair[1]] = els[pair[0]].value;
        if (pair[1] === "color") renderNodes();
        updateGenerateBtn();
      });
    });

  els.deleteNodeBtn.addEventListener("click", function () {
    if (state.selectedIndex < 0) return;
    state.nodes.splice(state.selectedIndex, 1);
    hideEditor();
    renderNodes();
    updateGenerateBtn();
  });

  // ---------- auto-fetch product info ----------
  els.autoFetchBtn.addEventListener("click", function () {
    var node = currentNode();
    if (!node) return;
    var proxyUrl = els.proxyUrlInput.value.trim();
    var productUrl = els.nodeUrl.value.trim();

    if (!productUrl) {
      setStatus("Enter the product page URL first.", "error");
      return;
    }
    if (!proxyUrl) {
      setStatus("No auto-fetch proxy URL set (see Settings below).", "error");
      return;
    }

    setStatus("Fetching…");
    fetch(proxyUrl.replace(/\/$/, "") + "/?url=" + encodeURIComponent(productUrl))
      .then(function (res) {
        if (!res.ok) throw new Error("Proxy returned " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data.name) { els.nodeName.value = data.name; node.name = data.name; }
        if (data.price) { els.nodePrice.value = data.price; node.price = data.price; }
        setStatus("Fetched product info.", "ok");
        updateGenerateBtn();
      })
      .catch(function (err) {
        setStatus("Auto-fetch failed: " + err.message, "error");
      });
  });

  function setStatus(msg, kind) {
    els.autoFetchStatus.textContent = msg || "";
    els.autoFetchStatus.className = "status-text" + (kind ? " " + kind : "");
  }
  function flashStatus(msg) {
    var prev = els.autoFetchStatus.textContent;
    setStatus(msg, "error");
    setTimeout(function () { setStatus(prev); }, 2000);
  }

  // ---------- embed generation ----------
  function updateGenerateBtn() {
    var ready = state.imageUrl && state.nodes.length > 0 &&
      state.nodes.every(function (n) { return n.url; });
    els.generateBtn.disabled = !ready;
  }

  els.generateBtn.addEventListener("click", function () {
    var runtimeUrl = els.runtimeUrlInput.value.trim() ||
      "https://YOUR-CDN-OR-GITHUB-PAGES-URL/shoppable-image.js";

    var config = {
      image: state.imageUrl,
      nodes: state.nodes.map(function (n) {
        return {
          x: Math.round(n.x * 100) / 100,
          y: Math.round(n.y * 100) / 100,
          color: n.color,
          url: n.url,
          name: n.name,
          price: n.price
        };
      })
    };

    var json = JSON.stringify(config).replace(/'/g, "&#39;");
    var html =
      '<div class="shoppable-image" data-shoppable=\'' + json + '\'></div>\n' +
      '<script src="' + runtimeUrl + '" defer></script>';

    els.outputCode.value = html;
    els.outputWrap.hidden = false;
  });

  els.copyBtn.addEventListener("click", function () {
    els.outputCode.select();
    navigator.clipboard.writeText(els.outputCode.value).then(function () {
      els.copyBtn.textContent = "Copied!";
      setTimeout(function () { els.copyBtn.textContent = "Copy to clipboard"; }, 1500);
    });
  });
})();
