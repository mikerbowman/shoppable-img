(function () {
  "use strict";

  var MAX_NODES = 6;
  var LS_RUNTIME_URL = "si_builder_runtime_url";
  var LS_PROXY_URL = "si_builder_proxy_url";
  // Live, working defaults so anyone opening this tool for the first time gets a
  // working embed (and working auto-fetch) immediately, without needing to know
  // what to paste into Settings.
  var DEFAULT_RUNTIME_URL = "https://cdn.jsdelivr.net/gh/mikerbowman/shoppable-img@main/runtime/shoppable-image.js";
  var DEFAULT_PROXY_URL = "https://shoppable-image-proxy.mikerbowman.workers.dev";

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
    nodeList: document.getElementById("nodeList"),
    addNodeBtn: document.getElementById("addNodeBtn"),
    editor: document.getElementById("editor"),
    editorIndex: document.getElementById("editorIndex"),
    nodeColor: document.getElementById("nodeColor"),
    nodeUrl: document.getElementById("nodeUrl"),
    nodeName: document.getElementById("nodeName"),
    nodePrice: document.getElementById("nodePrice"),
    autoFetchBtn: document.getElementById("autoFetchBtn"),
    autoFetchStatus: document.getElementById("autoFetchStatus"),
    deleteNodeBtn: document.getElementById("deleteNodeBtn"),
    imageFileInput: document.getElementById("imageFileInput"),
    imageUploadStatus: document.getElementById("imageUploadStatus"),
    runtimeUrlInput: document.getElementById("runtimeUrlInput"),
    proxyUrlInput: document.getElementById("proxyUrlInput"),
    generateBtn: document.getElementById("generateBtn"),
    outputWrap: document.getElementById("outputWrap"),
    outputCode: document.getElementById("outputCode"),
    copyBtn: document.getElementById("copyBtn")
  };

  // ---------- settings persistence ----------
  els.runtimeUrlInput.value = localStorage.getItem(LS_RUNTIME_URL) || DEFAULT_RUNTIME_URL;
  els.proxyUrlInput.value = localStorage.getItem(LS_PROXY_URL) || DEFAULT_PROXY_URL;
  els.runtimeUrlInput.addEventListener("input", function () {
    localStorage.setItem(LS_RUNTIME_URL, els.runtimeUrlInput.value.trim());
  });
  els.proxyUrlInput.addEventListener("input", function () {
    localStorage.setItem(LS_PROXY_URL, els.proxyUrlInput.value.trim());
  });

  // ---------- image loading ----------
  // Shared by both "paste a URL" and "upload a file" — either way we end up
  // with a src (a normal URL, or a data: URI) to drop into the stage image.
  function applyImageSrc(src, onError) {
    els.stageImg.onload = function () {
      state.imageUrl = src;
      state.nodes = [];
      state.selectedIndex = -1;
      els.canvasWrap.hidden = false;
      els.emptyState.hidden = true;
      els.editor.hidden = true;
      renderAll();
      updateGenerateBtn();
    };
    els.stageImg.onerror = onError || function () {
      alert("Could not load that image URL. Check it's a direct link to an image and allows hotlinking.");
    };
    els.stageImg.src = src;
  }

  function loadImage(url) {
    if (!url) return;
    els.imageFileInput.value = "";
    setUploadStatus("");
    applyImageSrc(url);
  }

  els.loadImageBtn.addEventListener("click", function () {
    loadImage(els.imageUrlInput.value.trim());
  });
  els.imageUrlInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") loadImage(els.imageUrlInput.value.trim());
  });

  // ---------- image upload ----------
  // Embeds are self-contained (no backend), so an uploaded file becomes a
  // compressed data: URI baked into the embed JSON — same as a pasted URL
  // from here on, just inline bytes instead of a link. Resized/compressed
  // client-side so a big photo doesn't bloat the embed HTML too much.
  var UPLOAD_MAX_DIMENSION = 1600;
  var UPLOAD_TARGET_BYTES = 900 * 1024;
  var UPLOAD_QUALITY_STEPS = [0.85, 0.6, 0.4];

  function approxDecodedBytes(dataUrl) {
    var base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return Math.round(base64.length * 0.75);
  }

  function fileToCompressedDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);

        var scale = Math.min(1, UPLOAD_MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale);
        var h = Math.round(img.naturalHeight * scale);

        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; // flatten transparency (e.g. PNGs) onto white before JPEG encoding
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        var dataUrl = canvas.toDataURL("image/jpeg", UPLOAD_QUALITY_STEPS[0]);
        for (var i = 1; i < UPLOAD_QUALITY_STEPS.length && approxDecodedBytes(dataUrl) > UPLOAD_TARGET_BYTES; i++) {
          dataUrl = canvas.toDataURL("image/jpeg", UPLOAD_QUALITY_STEPS[i]);
        }
        resolve(dataUrl);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read that image file."));
      };
      img.src = objectUrl;
    });
  }

  function setUploadStatus(msg, kind) {
    els.imageUploadStatus.textContent = msg || "";
    els.imageUploadStatus.className = "status-text" + (kind ? " " + kind : "");
  }

  els.imageFileInput.addEventListener("change", function () {
    var file = els.imageFileInput.files && els.imageFileInput.files[0];
    if (!file) return;
    if (file.type.indexOf("image/") !== 0) {
      setUploadStatus("Please choose an image file.", "error");
      return;
    }

    setUploadStatus("Processing image…");
    fileToCompressedDataUrl(file).then(function (dataUrl) {
      els.imageUrlInput.value = "";
      applyImageSrc(dataUrl, function () {
        setUploadStatus("Could not process that image file.", "error");
      });
      var kb = Math.round(approxDecodedBytes(dataUrl) / 1024);
      setUploadStatus("Uploaded (≈" + kb + " KB after compression).", "ok");
    }).catch(function (err) {
      setUploadStatus(err.message, "error");
    });
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
    var newIndex = state.nodes.length - 1;
    renderAll();
    selectNode(newIndex);
    updateGenerateBtn();
  }

  els.addNodeBtn.addEventListener("click", function () {
    if (!state.imageUrl || state.nodes.length >= MAX_NODES) return;
    // Stagger default positions so stacked "+ Add node" clicks don't pile up exactly on top of each other.
    var i = state.nodes.length;
    var x = clamp(30 + (i * 12) % 40);
    var y = clamp(30 + (i * 18) % 40);
    addNode(x, y);
  });

  function deleteNodeAt(index) {
    state.nodes.splice(index, 1);
    if (state.selectedIndex === index) {
      hideEditor();
    } else if (state.selectedIndex > index) {
      state.selectedIndex -= 1;
    }
    renderAll();
    updateGenerateBtn();
  }

  function clamp(n) { return Math.min(100, Math.max(0, n)); }

  // ---------- rendering ----------
  // Full rebuild: only ever called when the SET of nodes changes (add/delete/load),
  // never on selection or field edits — rebuilding mid-interaction (e.g. while a
  // pointer has captured a node for dragging) detaches the live element and
  // silently breaks the drag.
  function renderAll() {
    renderStageNodes();
    renderNodeList();
    els.nodeCount.textContent = String(state.nodes.length);
    els.addNodeBtn.disabled = !state.imageUrl || state.nodes.length >= MAX_NODES;
  }

  function renderStageNodes() {
    Array.from(els.stage.querySelectorAll(".editor-node")).forEach(function (el) { el.remove(); });

    state.nodes.forEach(function (node, i) {
      var el = document.createElement("div");
      el.className = "editor-node" + (i === state.selectedIndex ? " selected" : "");
      el.style.left = node.x + "%";
      el.style.top = node.y + "%";
      el.dataset.index = String(i);

      var ping = document.createElement("span");
      ping.className = "si-node-ping";
      ping.style.borderColor = node.color;

      var dot = document.createElement("span");
      dot.className = "si-node-dot";
      dot.style.borderColor = node.color;

      el.appendChild(ping);
      el.appendChild(dot);

      el.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        selectNode(i);
        startDrag(i, el, e);
      });

      els.stage.appendChild(el);
    });
  }

  function renderNodeList() {
    els.nodeList.innerHTML = "";

    state.nodes.forEach(function (node, i) {
      var chip = document.createElement("div");
      chip.className = "node-chip" + (i === state.selectedIndex ? " selected" : "");
      chip.dataset.index = String(i);

      var swatch = document.createElement("span");
      swatch.className = "chip-swatch";
      swatch.style.background = node.color;

      var label = document.createElement("span");
      label.className = "chip-label";
      label.textContent = "Node " + (i + 1) +
        (node.name ? " — " + node.name : "") +
        (node.price ? " (" + node.price + ")" : "");

      var del = document.createElement("button");
      del.type = "button";
      del.className = "chip-delete";
      del.textContent = "×";
      del.setAttribute("aria-label", "Delete node " + (i + 1));
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteNodeAt(i);
      });

      chip.appendChild(swatch);
      chip.appendChild(label);
      chip.appendChild(del);
      chip.addEventListener("click", function () { selectNode(i); });

      els.nodeList.appendChild(chip);
    });
  }

  // Selection only toggles classes on the elements that already exist —
  // it must never rebuild the DOM (see renderAll comment above).
  function updateSelectionUI() {
    els.stage.querySelectorAll(".editor-node").forEach(function (el) {
      el.classList.toggle("selected", Number(el.dataset.index) === state.selectedIndex);
    });
    els.nodeList.querySelectorAll(".node-chip").forEach(function (el) {
      el.classList.toggle("selected", Number(el.dataset.index) === state.selectedIndex);
    });
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
    updateSelectionUI();
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
    updateSelectionUI();
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
        if (pair[1] === "color") {
          var stageEl = els.stage.querySelector('.editor-node[data-index="' + state.selectedIndex + '"]');
          if (stageEl) {
            stageEl.querySelectorAll(".si-node-dot, .si-node-ping").forEach(function (ringEl) {
              ringEl.style.borderColor = node.color;
            });
          }
        }
        renderNodeList(); // cheap sidebar-only refresh to keep swatches/labels in sync
        updateGenerateBtn();
      });
    });

  els.deleteNodeBtn.addEventListener("click", function () {
    if (state.selectedIndex < 0) return;
    deleteNodeAt(state.selectedIndex);
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
    var runtimeUrl = els.runtimeUrlInput.value.trim() || DEFAULT_RUNTIME_URL;

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
