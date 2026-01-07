const STORAGE_KEY = "encounterTracker.v1";
const MAP_STORAGE_KEY = "encounterTracker.vtt.mapImage";
const VTT_STATE_KEY = "encounterTracker.vtt.state"; // token positions + settings

const el = (id) => document.getElementById(id);

const mapUpload = el("mapUpload");
const mapImage = el("mapImage");
const mapStage = el("mapStage");
const mapWorld = el("mapWorld");
const tokenLayer = el("tokenLayer");

const btnClearMap = el("btnClearMap");
const btnZoomIn = el("btnZoomIn");
const btnZoomOut = el("btnZoomOut");
const btnZoomReset = el("btnZoomReset");
const btnTokSm = el("btnTokSm");
const btnTokLg = el("btnTokLg");
const btnFullscreen = el("btnFullscreen");
const btnToggleMonsters = el("btnToggleMonsters");
const vttStatus = el("vttStatus");

function defaultAvatar(type) {
  const fill = type === "pc" ? "#c9a227" : "#7a0f1a";
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
      <rect width="96" height="96" rx="20" fill="#f6efe2"/>
      <circle cx="48" cy="40" r="18" fill="${fill}" opacity=".85"/>
      <rect x="22" y="62" width="52" height="18" rx="9" fill="${fill}" opacity=".45"/>
    </svg>
  `);
  return `data:image/svg+xml,${svg}`;
}

function loadTrackerState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function loadVttState() {
  const raw = localStorage.getItem(VTT_STATE_KEY);
  if (!raw) {
    return {
      mapScale: 1,
      tokenSize: 56,
      positions: {}, // encId -> {x,y}
      hidden: {},    // encId -> true
      hideMonsters: false
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      mapScale: Number(parsed.mapScale) || 1,
      tokenSize: Number(parsed.tokenSize) || 56,
      positions: parsed.positions || {},
      hidden: parsed.hidden || {},
      hideMonsters: !!parsed.hideMonsters
    };
  } catch {
    return {
      mapScale: 1,
      tokenSize: 56,
      positions: {},
      hidden: {},
      hideMonsters: false
    };
  }
}

function saveVttState(vtt) {
  localStorage.setItem(VTT_STATE_KEY, JSON.stringify(vtt));
}

function loadMap() {
  return localStorage.getItem(MAP_STORAGE_KEY) || "";
}

function saveMap(dataUrl) {
  if (dataUrl) localStorage.setItem(MAP_STORAGE_KEY, dataUrl);
  else localStorage.removeItem(MAP_STORAGE_KEY);
}

function applyScale(vtt) {
  mapWorld.style.transform = `scale(${vtt.mapScale})`;
  tokenLayer.style.setProperty("--tokenSize", `${vtt.tokenSize}px`);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Clamp token position so it cannot leave visible map stage.
 * We clamp in "mapWorld coordinates", so divide stage size by scale.
 */
function clampToBounds(x, y, vtt) {
  const stage = mapStage.getBoundingClientRect();
  const scale = vtt.mapScale || 1;
  const stageW = stage.width / scale;
  const stageH = stage.height / scale;

  const size = vtt.tokenSize || 56;
  const pad = 4;

  const maxX = Math.max(pad, stageW - size - pad);
  const maxY = Math.max(pad, stageH - size - pad);

  return {
    x: clamp(x, pad, maxX),
    y: clamp(y, pad, maxY),
  };
}

async function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Auto-compress big PNGs into smaller JPG so localStorage doesn't explode.
 */
function compressImage(img, maxWidth, quality) {
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL("image/jpeg", quality);
  return out;
}

function render() {
  const tracker = loadTrackerState();
  const enc = tracker?.encounter;
  const roster = enc?.roster || [];

  const vtt = loadVttState();
  applyScale(vtt);

  // Status line
  if (vttStatus) {
    const name = (enc?.name || "").trim() || "(unnamed encounter)";
    vttStatus.textContent = `Showing tokens for: ${name}`;
  }

  // Map
  const mapData = loadMap();
  if (mapData) {
    mapImage.src = mapData;
    mapImage.style.opacity = "1";
  } else {
    mapImage.removeAttribute("src");
    mapImage.style.opacity = "0";
  }

  // Tokens
  tokenLayer.innerHTML = "";

  roster.forEach((c, i) => {
    const token = document.createElement("div");
    token.className = "token";
    token.dataset.encId = c.encId;

    // Hide monsters (DM toggle)
    const isMonster = c.type === "monster";
    const hiddenByType = vtt.hideMonsters && isMonster;
    const hiddenByFlag = !!vtt.hidden[c.encId];

    if (hiddenByType || hiddenByFlag) token.classList.add("isHidden");

    const img = document.createElement("img");
    img.src = c.avatar || defaultAvatar(c.type);
    img.onerror = () => (img.src = defaultAvatar(c.type));

    const label = document.createElement("div");
    label.className = "tokenLabel";
    label.textContent = c.name;

    token.appendChild(img);
    token.appendChild(label);

    // Position (mapWorld coords)
    let pos = vtt.positions[c.encId];
    if (!pos) {
      pos = { x: 20 + i * (vtt.tokenSize + 14), y: 20 };
    }

    const clamped = clampToBounds(pos.x, pos.y, vtt);
    vtt.positions[c.encId] = clamped;

    token.style.left = `${clamped.x}px`;
    token.style.top = `${clamped.y}px`;

    enableDrag(token, vtt);

    // Right-click toggles hide for that token (DM convenience)
    token.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const id = c.encId;
      vtt.hidden[id] = !vtt.hidden[id];
      saveVttState(vtt);
      render();
    });

    tokenLayer.appendChild(token);
  });

  saveVttState(vtt);
}

function enableDrag(tokenEl, vtt) {
  let dragging = false;
  let startX = 0, startY = 0;
  let originLeft = 0, originTop = 0;

  const onDown = (e) => {
    dragging = true;
    tokenEl.setPointerCapture(e.pointerId);

    // IMPORTANT: account for map scale so drag distance feels correct
    const scale = vtt.mapScale || 1;

    startX = e.clientX;
    startY = e.clientY;
    originLeft = parseFloat(tokenEl.style.left || "0");
    originTop = parseFloat(tokenEl.style.top || "0");

    tokenEl.style.zIndex = "999";
    e.preventDefault();
  };

  const onMove = (e) => {
    if (!dragging) return;

    const scale = vtt.mapScale || 1;
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;

    const nextX = originLeft + dx;
    const nextY = originTop + dy;

    const clamped = clampToBounds(nextX, nextY, vtt);

    tokenEl.style.left = `${clamped.x}px`;
    tokenEl.style.top = `${clamped.y}px`;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    tokenEl.style.zIndex = "";

    // Persist final pos
    const id = tokenEl.dataset.encId;
    vtt.positions[id] = {
      x: parseFloat(tokenEl.style.left || "0"),
      y: parseFloat(tokenEl.style.top || "0"),
    };
    saveVttState(vtt);
  };

  tokenEl.addEventListener("pointerdown", onDown);
  tokenEl.addEventListener("pointermove", onMove);
  tokenEl.addEventListener("pointerup", onUp);
  tokenEl.addEventListener("pointercancel", onUp);
}

/* ---------- Controls ---------- */

// Upload new map (auto-compress to avoid localStorage size issues)
mapUpload?.addEventListener("change", async () => {
  const file = mapUpload.files?.[0];
  if (!file) return;

  try {
    const dataUrl = await fileToDataURL(file);
    const img = await dataUrlToImage(dataUrl);

    // These values are safe defaults for quality vs size
    const MAX_W = 2600;
    const QUALITY = 0.82;

    const compressed = compressImage(img, MAX_W, QUALITY);
    saveMap(compressed);

    mapUpload.value = "";
    render();
  } catch (e) {
    console.warn(e);
    alert("Upload failed. Try a different image (JPG works best).");
  }
});

btnClearMap?.addEventListener("click", () => {
  saveMap("");
  render();
});

btnZoomIn?.addEventListener("click", () => {
  const vtt = loadVttState();
  vtt.mapScale = clamp((vtt.mapScale || 1) + 0.1, 0.5, 2.5);
  saveVttState(vtt);
  render();
});
btnZoomOut?.addEventListener("click", () => {
  const vtt = loadVttState();
  vtt.mapScale = clamp((vtt.mapScale || 1) - 0.1, 0.5, 2.5);
  saveVttState(vtt);
  render();
});
btnZoomReset?.addEventListener("click", () => {
  const vtt = loadVttState();
  vtt.mapScale = 1;
  saveVttState(vtt);
  render();
});

btnTokLg?.addEventListener("click", () => {
  const vtt = loadVttState();
  vtt.tokenSize = clamp((vtt.tokenSize || 56) + 6, 28, 110);
  saveVttState(vtt);
  render();
});
btnTokSm?.addEventListener("click", () => {
  const vtt = loadVttState();
  vtt.tokenSize = clamp((vtt.tokenSize || 56) - 6, 28, 110);
  saveVttState(vtt);
  render();
});

btnFullscreen?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await mapStage.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.warn(e);
    alert("Fullscreen blocked by the browser. Try clicking the map first, then press Fullscreen.");
  }
});

// Hide all monsters (toggle)
btnToggleMonsters?.addEventListener("click", () => {
  const vtt = loadVttState();
  vtt.hideMonsters = !vtt.hideMonsters;
  saveVttState(vtt);
  render();
});

// Sync if tracker updates encounter while battlemap is open
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) render();
});

render();
