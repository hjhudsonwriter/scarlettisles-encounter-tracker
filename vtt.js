const STORAGE_KEY = "encounterTracker.v1";
const MAP_STORAGE_KEY = "encounterTracker.vtt.mapImage";
const VTT_STATE_KEY = "encounterTracker.vtt.state";

const el = (id) => document.getElementById(id);

const mapUpload = el("mapUpload");
const btnClearMap = el("btnClearMap");
const mapStage = el("mapStage");
const mapWorld = el("mapWorld");
const mapImage = el("mapImage");
const tokenLayer = el("tokenLayer");
const marquee = el("marquee");
const vttStatus = el("vttStatus");

const btnZoomOut = el("btnZoomOut");
const btnZoomIn = el("btnZoomIn");
const btnZoomReset = el("btnZoomReset");

const btnTokSm = el("btnTokSm");
const btnTokLg = el("btnTokLg");

const btnFullscreen = el("btnFullscreen");
const btnToggleMonsters = el("btnToggleMonsters");
const btnGrid = el("btnGrid");
const btnSnap = el("btnSnap");
const btnGridSm = el("btnGridSm");
const btnGridLg = el("btnGridLg");
const btnNudgeL = el("btnNudgeL");
const btnNudgeR = el("btnNudgeR");
const btnNudgeU = el("btnNudgeU");
const btnNudgeD = el("btnNudgeD");
const gridReadout = el("gridReadout");
const btnFog = el("btnFog");
const btnFogAll = el("btnFogAll");
const btnFogCover = el("btnFogCover");
const btnFogSm = el("btnFogSm");
const btnFogLg = el("btnFogLg");
const fogReadout = el("fogReadout");
const btnMeasure = el("btnMeasure");
const measureReadout = el("measureReadout");
const fsBtnGrid = el("fsBtnGrid");
const fsBtnGridSm = el("fsBtnGridSm");
const fsBtnGridLg = el("fsBtnGridLg");
const fsBtnNudgeL = el("fsBtnNudgeL");
const fsBtnNudgeR = el("fsBtnNudgeR");
const fsBtnNudgeU = el("fsBtnNudgeU");
const fsBtnNudgeD = el("fsBtnNudgeD");

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

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

function loadMap() {
  return localStorage.getItem(MAP_STORAGE_KEY) || "";
}

function saveMap(dataUrl) {
  if (dataUrl) localStorage.setItem(MAP_STORAGE_KEY, dataUrl);
  else localStorage.removeItem(MAP_STORAGE_KEY);
}

function loadVttState() {
  const fallback = {
    camera: { x: 0, y: 0, zoom: 1 },
    tokenPos: {},
    tokenSize: 56,
    hideMonsters: false,

    // Grid overlay + snap
    grid: {
      show: false,
      snap: false,
      size: 70,
      offX: 0,
      offY: 0,
      opacity: 0.35
    },

    // Fog of War
    fog: {
      enabled: false,
      revealAll: true,      // when fog is "off", we treat it as revealed
      radiusSquares: 6,
      opacity: 0.90
    }
  };

  const raw = localStorage.getItem(VTT_STATE_KEY);
  if (!raw) return fallback;

  try {
    const s = JSON.parse(raw) || {};

    s.camera ||= fallback.camera;
    s.tokenPos ||= {};
    s.tokenSize ??= fallback.tokenSize;
    s.hideMonsters ??= fallback.hideMonsters;

    // Grid defaults
    s.grid ||= {};
    s.grid.show ??= fallback.grid.show;
    s.grid.snap ??= fallback.grid.snap;
    s.grid.size ??= fallback.grid.size;
    s.grid.offX ??= fallback.grid.offX;
    s.grid.offY ??= fallback.grid.offY;
    s.grid.opacity ??= fallback.grid.opacity;

    // Fog defaults
    s.fog ||= {};
    s.fog.enabled ??= fallback.fog.enabled;
    s.fog.revealAll ??= fallback.fog.revealAll;
    s.fog.radiusSquares ??= fallback.fog.radiusSquares;
    s.fog.opacity ??= fallback.fog.opacity;

    return s;
  } catch {
    return fallback;
  }
}

let vttState = loadVttState();

function saveVttState() {
  localStorage.setItem(VTT_STATE_KEY, JSON.stringify(vttState));
}
// ---------- Grid overlay (canvas) ----------
let gridCanvas = null;
let gridCtx = null;

function ensureGridCanvas() {
  if (gridCanvas) return;

  gridCanvas = document.createElement("canvas");
gridCanvas.id = "gridCanvas";
gridCanvas.style.opacity = String(vttState.grid?.opacity ?? 0.35);
gridCanvas.style.display = "none"; // drawGrid() will toggle it on/off

  // Put it above the map image but below tokens
  // mapWorld contains: img, tokenLayer, marquee
  // Insert before tokenLayer so tokens sit above it
  mapWorld.insertBefore(gridCanvas, tokenLayer);

  gridCtx = gridCanvas.getContext("2d");
}

function resizeGridCanvas() {
  if (!gridCanvas) return;
  const w = mapStage.clientWidth || 1;
  const h = mapStage.clientHeight || 1;

  // High DPI crispness
  const dpr = window.devicePixelRatio || 1;
  gridCanvas.width = Math.floor(w * dpr);
  gridCanvas.height = Math.floor(h * dpr);
  gridCanvas.style.width = `${w}px`;
  gridCanvas.style.height = `${h}px`;

  gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawGrid() {
  ensureGridCanvas();
  resizeGridCanvas();

  const g = vttState.grid;
  if (!g || !g.show) {
  // Hide the canvas completely when grid is off
  gridCanvas.style.display = "none";
  gridCtx.clearRect(0, 0, mapStage.clientWidth || 1, mapStage.clientHeight || 1);
  return;
}

// Show the canvas when grid is on
gridCanvas.style.display = "block";

  gridCanvas.style.opacity = String(g.opacity ?? 0.35);

  const w = mapStage.clientWidth || 1;
  const h = mapStage.clientHeight || 1;
  const size = Math.max(10, Number(g.size) || 70);

  // Offsets in WORLD space (not affected by camera translate), so alignment sticks
  const offX = Number(g.offX) || 0;
  const offY = Number(g.offY) || 0;

  gridCtx.clearRect(0, 0, w, h);
  gridCtx.lineWidth = 1;
  gridCtx.strokeStyle = "rgba(255,255,255,0.35)";

  // Draw verticals
  let xStart = offX % size;
  if (xStart < 0) xStart += size;

  for (let x = xStart; x <= w; x += size) {
    gridCtx.beginPath();
    gridCtx.moveTo(x + 0.5, 0);
    gridCtx.lineTo(x + 0.5, h);
    gridCtx.stroke();
  }

  // Draw horizontals
  let yStart = offY % size;
  if (yStart < 0) yStart += size;

  for (let y = yStart; y <= h; y += size) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, y + 0.5);
    gridCtx.lineTo(w, y + 0.5);
    gridCtx.stroke();
  }
}

function updateGridUI() {
  const g = vttState.grid;
  if (!g) return;

  if (btnGrid) btnGrid.textContent = `Grid: ${g.show ? "On" : "Off"}`;
  if (btnSnap) btnSnap.textContent = `Snap: ${g.snap ? "On" : "Off"}`;

  if (gridReadout) {
    gridReadout.textContent = `Grid: ${Math.round(g.size)}px • Offset: ${Math.round(g.offX)},${Math.round(g.offY)}`;
  }
}
// ---------- Fog of War (canvas) ----------
let fogCanvas = null;
let fogCtx = null;

function ensureFogCanvas() {
  if (fogCanvas) return;

  fogCanvas = document.createElement("canvas");
  fogCanvas.id = "fogCanvas";
  fogCanvas.style.position = "absolute";
  fogCanvas.style.inset = "0";
  fogCanvas.style.pointerEvents = "none";
  fogCanvas.style.display = "none";

  // IMPORTANT layering:
  // Put fog above tokens so tokens are hidden unless revealed
  // but keep marquee above fog (marquee is last)
  mapWorld.insertBefore(fogCanvas, marquee);

  fogCtx = fogCanvas.getContext("2d");
}

function resizeFogCanvas() {
  if (!fogCanvas) return;

  const w = mapStage.clientWidth || 1;
  const h = mapStage.clientHeight || 1;

  const dpr = window.devicePixelRatio || 1;
  fogCanvas.width = Math.floor(w * dpr);
  fogCanvas.height = Math.floor(h * dpr);
  fogCanvas.style.width = `${w}px`;
  fogCanvas.style.height = `${h}px`;

  fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fogRadiusPx() {
  const g = vttState.grid;
  const f = vttState.fog;

  const squares = Math.max(1, Number(f?.radiusSquares) || 6);
  const size = Math.max(10, Number(g?.size) || 70);

  return squares * size;
}

function drawFog() {
  ensureFogCanvas();
  resizeFogCanvas();

  const f = vttState.fog;
  if (!f || !f.enabled || f.revealAll) {
    fogCanvas.style.display = "none";
    fogCtx.clearRect(0, 0, mapStage.clientWidth || 1, mapStage.clientHeight || 1);
    return;
  }

  fogCanvas.style.display = "block";

  const w = mapStage.clientWidth || 1;
  const h = mapStage.clientHeight || 1;

  fogCtx.clearRect(0, 0, w, h);

  // Fill darkness
  fogCtx.globalCompositeOperation = "source-over";
  fogCtx.fillStyle = `rgba(0,0,0,${clamp(Number(f.opacity) || 0.9, 0.05, 0.98)})`;
  fogCtx.fillRect(0, 0, w, h);

  // Cut holes around PCs
  const r = fogRadiusPx();

  fogCtx.globalCompositeOperation = "destination-out";

  // Find PC token centers from current DOM positions
  roster
    .filter(c => c.type === "pc")
    .forEach(c => {
      const elx = tokenEls.get(c.encId);
      if (!elx) return;

      const left = parseFloat(elx.style.left || "0");
      const top = parseFloat(elx.style.top || "0");
      const img = elx.querySelector("img");
      const size = img ? (parseFloat(getComputedStyle(img).width) || 56) : 56;

      const cx = left + size / 2;
      const cy = top + size / 2;

      fogCtx.beginPath();
      fogCtx.arc(cx, cy, r, 0, Math.PI * 2);
      fogCtx.fill();
    });

  fogCtx.globalCompositeOperation = "source-over";
}

function updateFogUI() {
  const f = vttState.fog;
  if (!f) return;

  if (btnFog) btnFog.textContent = `Fog: ${f.enabled ? "On" : "Off"}`;

  if (fogReadout) {
    const r = Number(f.radiusSquares) || 6;
    fogReadout.textContent = `Fog: ${r} sq • ${f.revealAll ? "Revealed" : "Covered"}`;
  }
}

// ---------- Camera / world transform ----------
function applyCamera() {
  const { x, y, zoom } = vttState.camera;
  mapWorld.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  saveVttState();
}

function applyTokenSize() {
  const size = Number(vttState.tokenSize) || 56;
  mapStage.style.setProperty("--tokenSize", `${clamp(size, 24, 140)}px`);
  saveVttState();
}

// Work in WORLD coordinates (so zoom/fullscreen doesn’t break)
function worldDims() {
  const zoom = vttState.camera.zoom || 1;
  return {
    w: (mapStage.clientWidth || 1) / zoom,
    h: (mapStage.clientHeight || 1) / zoom,
    zoom
  };
}

function pxToNorm(px, py) {
  const { w, h } = worldDims();
  return { x: px / w, y: py / h };
}

function normToPx(nx, ny) {
  const { w, h } = worldDims();
  return { x: nx * w, y: ny * h };
}

function clampTokenToStage(px, py, tokenSize) {
  const { w, h } = worldDims();
  return {
    x: clamp(px, 0, Math.max(0, w - tokenSize)),
    y: clamp(py, 0, Math.max(0, h - tokenSize))
  };
}

// ---------- Map restore/upload ----------
(function restoreMap() {
  const saved = loadMap();
  if (saved) {
    mapImage.src = saved;
    mapImage.style.display = "block";
  } else {
    mapImage.removeAttribute("src");
    mapImage.style.display = "none";
  }
})();

mapUpload?.addEventListener("change", () => {
  const file = mapUpload.files && mapUpload.files[0];
  if (!file) return;

  const maxBytes = 4 * 1024 * 1024; // localStorage is small
  if (file.size > maxBytes) {
    alert("That image is over ~4MB. Please use a smaller file (JPG recommended).");
    mapUpload.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    saveMap(dataUrl);
    mapImage.src = dataUrl;
    mapImage.style.display = "block";
    mapUpload.value = "";
  };
  reader.readAsDataURL(file);
});

btnClearMap?.addEventListener("click", () => {
  saveMap("");
  mapImage.removeAttribute("src");
  mapImage.style.display = "none";
});

// ---------- Tokens ----------
// ---------- Tokens ----------
let roster = [];
let selected = new Set(); // encIds
let tokenEls = new Map(); // encId -> element

// Which token should be highlighted as "current turn"
let activeTurnEncId = null;

function ensureDefaultPositions() {
  const existing = vttState.tokenPos;
  let idx = 0;
  roster.forEach((c) => {
    if (existing[c.encId]) return;
    const nx = 0.06 + (idx * 0.08);
    const ny = 0.08 + ((idx > 10 ? 1 : 0) * 0.10);
    existing[c.encId] = { x: clamp(nx, 0.05, 0.95), y: clamp(ny, 0.05, 0.95) };
    idx++;
  });
  saveVttState();
}

function renderTokens() {
  tokenLayer.innerHTML = "";
  tokenEls.clear();

  roster.forEach((c) => {
    const token = document.createElement("div");
    token.className = "token";
    token.dataset.encId = c.encId;

    // Highlight the token whose turn it is
if (activeTurnEncId && c.encId === activeTurnEncId) {
  token.classList.add("isActiveTurn");
}
    // DM hidden: individual tokens
if (vttState.hidden?.[c.encId]) token.classList.add("isHidden");

// Optional: blanket hide monsters switch too
if (vttState.hideMonsters && c.type === "monster") token.classList.add("isHidden");

    const img = document.createElement("img");
    img.src = c.avatar || defaultAvatar(c.type);
    img.onerror = () => (img.src = defaultAvatar(c.type));

    const label = document.createElement("div");
    label.className = "tokenLabel";
    label.textContent = c.name;

    token.appendChild(img);
    token.appendChild(label);

    if (vttState.hideMonsters && c.type === "monster") {
      token.classList.add("isHidden");
    }

    const pos = vttState.tokenPos[c.encId] || { x: 0.1, y: 0.1 };
    const { x, y } = normToPx(pos.x, pos.y);
    token.style.left = `${x}px`;
    token.style.top = `${y}px`;
    token.classList.toggle("isSelected", selected.has(c.encId));

    enableTokenInput(token);

    tokenLayer.appendChild(token);
    tokenEls.set(c.encId, token);
  });
  drawFog();
}

function clearSelected() {
  selected.clear();
  renderTokens();
}

// Convert screen pointer to WORLD coords (undo camera transform)
function pointerToWorld(e) {
  const rect = mapStage.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const { x, y, zoom } = vttState.camera;
  return { x: (sx - x) / zoom, y: (sy - y) / zoom };
}

// ---------- Drag tokens (supports multi-select) ----------
function enableTokenInput(tokenEl) {
  tokenEl.addEventListener("pointerdown", (e) => {
    if (camera.isPanning || marqueeState.dragging) return;

    e.preventDefault();
    e.stopPropagation();

    const encId = tokenEl.dataset.encId;

    if (e.ctrlKey) {
  // Ctrl-click toggles selection
  if (selected.has(encId)) selected.delete(encId);
  else selected.add(encId);
} else {
  // Normal click selects just this token
  if (!selected.has(encId) || selected.size > 1) {
    selected.clear();
    selected.add(encId);
  }
}
renderTokens();

    const start = pointerToWorld(e);
    const groupStart = [];

    selected.forEach((id) => {
      const elx = tokenEls.get(id);
      if (!elx) return;
      groupStart.push({
        id,
        left: parseFloat(elx.style.left || "0"),
        top: parseFloat(elx.style.top || "0")
      });
    });

    // Capture pointer on the actual clicked element (img/label), otherwise Chrome can throw InvalidStateError
const captureEl = (e.target && typeof e.target.setPointerCapture === "function") ? e.target : tokenEl;

let captureOk = false;

try {
  captureEl.setPointerCapture(e.pointerId);
  captureOk = true;
} catch (err) {
  captureOk = false;
}

const onMove = (ev) => {
  const now = pointerToWorld(ev);
  const dx = now.x - start.x;
  const dy = now.y - start.y;

  groupStart.forEach((t) => {
    const elx = tokenEls.get(t.id);
    if (!elx) return;

    const tokenSize = elx.querySelector("img")?.getBoundingClientRect().width || 56;
    let nextX = t.left + dx;
let nextY = t.top + dy;

const g = vttState.grid;
if (g && g.snap) {
  const size = Math.max(10, Number(g.size) || 70);
  const offX = Number(g.offX) || 0;
  const offY = Number(g.offY) || 0;

  // Snap TOKEN CENTER to nearest grid intersection
  const cx = nextX + tokenSize / 2;
  const cy = nextY + tokenSize / 2;

  const snapCx = Math.round((cx - offX) / size) * size + offX;
  const snapCy = Math.round((cy - offY) / size) * size + offY;

  nextX = snapCx - tokenSize / 2;
  nextY = snapCy - tokenSize / 2;
}

const clampedPos = clampTokenToStage(nextX, nextY, tokenSize);

    elx.style.left = `${clampedPos.x}px`;
    elx.style.top = `${clampedPos.y}px`;

    const n = pxToNorm(clampedPos.x, clampedPos.y);
    vttState.tokenPos[t.id] = { x: n.x, y: n.y };
  });

  saveVttState();
};

const onUp = () => {
const listenEl = captureOk ? captureEl : window;

listenEl.removeEventListener("pointermove", onMove);
listenEl.removeEventListener("pointerup", onUp);
listenEl.removeEventListener("pointercancel", onUp);
};

// IMPORTANT: listen on the captured element (tokenEl), not window
const listenEl = captureOk ? captureEl : window;

listenEl.addEventListener("pointermove", onMove, { passive: false });
listenEl.addEventListener("pointerup", onUp);
listenEl.addEventListener("pointercancel", onUp);
  });
}

// ---------- Spacebar pan ----------
const camera = { isPanning: false, startX: 0, startY: 0, originX: 0, originY: 0 };
const keys = { space: false };

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    keys.space = true;
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") keys.space = false;
});

mapStage.addEventListener("pointerdown", (e) => {
    // If clicking UI buttons inside the stage, do nothing here
  if (e.target && e.target.closest && e.target.closest("#btnMeasure")) return;
    if (measureState.enabled && !keys.space && !e.ctrlKey) {
    // Start measuring
    measureState.dragging = true;
    measureState.a = pointerToWorld(e);
    measureState.b = measureState.a;

    mapStage.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (e.ctrlKey && !keys.space) {
    startMarquee(e);
    return;
  }

  if (keys.space) {
    camera.isPanning = true;
    const rect = mapStage.getBoundingClientRect();
    camera.startX = e.clientX - rect.left;
    camera.startY = e.clientY - rect.top;
    camera.originX = vttState.camera.x;
    camera.originY = vttState.camera.y;

    mapStage.setPointerCapture(e.pointerId);
    e.preventDefault();
  } else {
    if (!e.ctrlKey) {
      const hitToken = e.target && e.target.closest && e.target.closest(".token");
      if (!hitToken) clearSelected();
    }
  }
});

mapStage.addEventListener("pointermove", (e) => {
  if (!camera.isPanning) return;
  const rect = mapStage.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const dx = mx - camera.startX;
  const dy = my - camera.startY;

  vttState.camera.x = camera.originX + dx;
  vttState.camera.y = camera.originY + dy;
  applyCamera();
});

mapStage.addEventListener("pointermove", (e) => {
  if (!measureState.enabled || !measureState.dragging) return;
  measureState.b = pointerToWorld(e);
  drawMeasureLine();
});

mapStage.addEventListener("pointerup", () => {
  camera.isPanning = false;

  if (measureState.dragging) {
    measureState.dragging = false;
    measureState.a = null;
    measureState.b = null;
    if (measureReadout) measureReadout.hidden = true;
    clearMeasure();
  }
});

mapStage.addEventListener("pointercancel", () => {
  camera.isPanning = false;
  
  if (measureState.dragging) {
    measureState.dragging = false;
    measureState.a = null;
    measureState.b = null;
    if (measureReadout) measureReadout.hidden = true;
    clearMeasure();
  }
});

// ---------- Ctrl + wheel zoom ----------
mapStage.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();

  const zoom = vttState.camera.zoom || 1;
  const delta = -Math.sign(e.deltaY) * 0.08;
  vttState.camera.zoom = clamp(zoom + delta, 0.5, 3);
  applyCamera();
}, { passive: false });

// ---------- Ctrl+drag marquee selection ----------
const marqueeState = { dragging: false, start: null, rect: null };

function startMarquee(e) {
  marqueeState.dragging = true;
  marquee.hidden = false;

  const start = pointerToWorld(e);
  marqueeState.start = start;

  marquee.style.left = `${start.x}px`;
  marquee.style.top = `${start.y}px`;
  marquee.style.width = `0px`;
  marquee.style.height = `0px`;

  mapStage.setPointerCapture(e.pointerId);
  e.preventDefault();
}

mapStage.addEventListener("pointermove", (e) => {
  if (!marqueeState.dragging) return;

  const a = marqueeState.start;
  const b = pointerToWorld(e);

  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);

  marquee.style.left = `${x1}px`;
  marquee.style.top = `${y1}px`;
  marquee.style.width = `${x2 - x1}px`;
  marquee.style.height = `${y2 - y1}px`;

  marqueeState.rect = { x1, y1, x2, y2 };
});

mapStage.addEventListener("pointerup", () => {
  if (!marqueeState.dragging) return;

  marqueeState.dragging = false;
  marquee.hidden = true;

  const r = marqueeState.rect;
  if (!r) return;

  selected.clear();
  tokenEls.forEach((tokenEl, encId) => {
    const left = parseFloat(tokenEl.style.left || "0");
    const top = parseFloat(tokenEl.style.top || "0");
    const img = tokenEl.querySelector("img");
    const size = img ? (parseFloat(getComputedStyle(img).width) || 56) : 56;

    const cx = left + size / 2;
    const cy = top + size / 2;

    if (cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2) {
      selected.add(encId);
    }
  });

  renderTokens();
});

// ---------- Buttons (bind once) ----------
btnFog?.addEventListener("click", () => {
  vttState.fog.enabled = !vttState.fog.enabled;
  if (!vttState.fog.enabled) vttState.fog.revealAll = true; // when off, treat as revealed
  saveVttState();
  updateFogUI();
  drawFog();
});

btnFogAll?.addEventListener("click", () => {
  vttState.fog.enabled = true;
  vttState.fog.revealAll = true;
  saveVttState();
  updateFogUI();
  drawFog();
});

btnFogCover?.addEventListener("click", () => {
  vttState.fog.enabled = true;
  vttState.fog.revealAll = false;
  saveVttState();
  updateFogUI();
  drawFog();
});

btnFogLg?.addEventListener("click", () => {
  vttState.fog.radiusSquares = clamp((vttState.fog.radiusSquares || 6) + 1, 1, 30);
  saveVttState();
  updateFogUI();
  drawFog();
});

btnFogSm?.addEventListener("click", () => {
  vttState.fog.radiusSquares = clamp((vttState.fog.radiusSquares || 6) - 1, 1, 30);
  saveVttState();
  updateFogUI();
  drawFog();
});

btnZoomIn?.addEventListener("click", () => {
  vttState.camera.zoom = clamp((vttState.camera.zoom || 1) + 0.15, 0.5, 3);
  applyCamera();
  renderTokens();
});

btnZoomOut?.addEventListener("click", () => {
  vttState.camera.zoom = clamp((vttState.camera.zoom || 1) - 0.15, 0.5, 3);
  applyCamera();
  renderTokens();
});

btnZoomReset?.addEventListener("click", () => {
  vttState.camera.zoom = 1;
  vttState.camera.x = 0;
  vttState.camera.y = 0;
  applyCamera();
  renderTokens();
});

btnTokLg?.addEventListener("click", () => {
  vttState.tokenSize = clamp((vttState.tokenSize || 56) + 8, 24, 140);
  applyTokenSize();
  renderTokens();
});

btnTokSm?.addEventListener("click", () => {
  vttState.tokenSize = clamp((vttState.tokenSize || 56) - 8, 24, 140);
  applyTokenSize();
  renderTokens();
});

btnFullscreen?.addEventListener("click", async () => {
  if (!document.fullscreenElement) await mapStage.requestFullscreen();
  else await document.exitFullscreen();
});

btnMeasure?.addEventListener("click", (e) => {
  e.stopPropagation(); // IMPORTANT: don't let mapStage treat this as a measure drag

  measureState.enabled = !measureState.enabled;
  btnMeasure.classList.toggle("isOn", measureState.enabled);

  if (!measureState.enabled){
    measureState.dragging = false;
    measureState.a = null;
    measureState.b = null;
    if (measureReadout) measureReadout.hidden = true;
    clearMeasure();
  }
});

// Also block pointerdown so click can complete normally
btnMeasure?.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
});

btnToggleMonsters?.addEventListener("click", () => {
  vttState.hideMonsters = !vttState.hideMonsters;
  if (btnToggleMonsters) {
    btnToggleMonsters.textContent = vttState.hideMonsters ? "Show monsters" : "Hide monsters";
  }
  saveVttState();
  renderTokens();
});
btnGrid?.addEventListener("click", () => {
  vttState.grid.show = !vttState.grid.show;
  saveVttState();
  updateGridUI();
  drawGrid();
});

// Grid size step: normal click = small, Shift+click = big
function gridSizeStep(e){
  return e && e.shiftKey ? 10 : 2;
}

btnSnap?.addEventListener("click", () => {
  vttState.grid.snap = !vttState.grid.snap;
  saveVttState();
  updateGridUI();
});

btnGridLg?.addEventListener("click", (e) => {
  const step = gridSizeStep(e);
  vttState.grid.size = clamp((vttState.grid.size || 70) + step, 10, 300);
  saveVttState();
  updateGridUI();
  drawGrid();
});

btnGridSm?.addEventListener("click", (e) => {
  const step = gridSizeStep(e);
  vttState.grid.size = clamp((vttState.grid.size || 70) - step, 10, 300);
  saveVttState();
  updateGridUI();
  drawGrid();
});

// Fullscreen sidebar grid controls (mirror the top controls)
fsBtnGrid?.addEventListener("click", () => {
  vttState.grid.show = !vttState.grid.show;
  saveVttState(); updateGridUI(); drawGrid();
});

fsBtnGridSm?.addEventListener("click", (e) => {
  const step = gridSizeStep(e);
  vttState.grid.size = clamp((vttState.grid.size || 70) - step, 10, 300);
  saveVttState(); updateGridUI(); drawGrid();
});

fsBtnGridLg?.addEventListener("click", (e) => {
  const step = gridSizeStep(e);
  vttState.grid.size = clamp((vttState.grid.size || 70) + step, 10, 300);
  saveVttState(); updateGridUI(); drawGrid();
});

// Nudge amount matches your existing NUDGE logic
const FS_NUDGE = 2;
fsBtnNudgeL?.addEventListener("click", () => {
  vttState.grid.offX = (vttState.grid.offX || 0) - FS_NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});
fsBtnNudgeR?.addEventListener("click", () => {
  vttState.grid.offX = (vttState.grid.offX || 0) + FS_NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});
fsBtnNudgeU?.addEventListener("click", () => {
  vttState.grid.offY = (vttState.grid.offY || 0) - FS_NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});
fsBtnNudgeD?.addEventListener("click", () => {
  vttState.grid.offY = (vttState.grid.offY || 0) + FS_NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});

// Nudge = align overlay to printed grid
const NUDGE = 2;

btnNudgeL?.addEventListener("click", () => {
  vttState.grid.offX = (vttState.grid.offX || 0) - NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});
btnNudgeR?.addEventListener("click", () => {
  vttState.grid.offX = (vttState.grid.offX || 0) + NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});
btnNudgeU?.addEventListener("click", () => {
  vttState.grid.offY = (vttState.grid.offY || 0) - NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});
btnNudgeD?.addEventListener("click", () => {
  vttState.grid.offY = (vttState.grid.offY || 0) + NUDGE;
  saveVttState(); updateGridUI(); drawGrid();
});

document.addEventListener("fullscreenchange", () => {
  renderTokens();
});

// ---------- Resize stability ----------
const ro = new ResizeObserver(() => {
  renderTokens();
  drawGrid();
});
ro.observe(mapStage);

// ---------- Cross-tab updates ----------
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    hydrateFromTracker();
    return;
  }

  if (e.key === VTT_STATE_KEY) {
    // Another tab (the tracker) changed VTT settings (hide monsters, grid, snap, etc.)
    vttState = loadVttState();
    applyCamera();
    applyTokenSize();
    renderTokens();

    // If your grid code uses a drawGrid() function, call it here too:
    if (typeof drawGrid === "function") drawGrid();
  }
});

// ---------- Measure tool (ruler) ----------
let measureCanvas = null;
let measureCtx = null;

const measureState = {
  enabled: false,
  dragging: false,
  a: null,
  b: null
};

function ensureMeasureCanvas(){
  if (measureCanvas) return;

  measureCanvas = document.createElement("canvas");
  measureCanvas.id = "measureCanvas";
  measureCanvas.style.position = "absolute";
  measureCanvas.style.inset = "0";
  measureCanvas.style.zIndex = "25";
  measureCanvas.style.pointerEvents = "none";

  // Put above fog/tokens? We insert before marquee so marquee stays top-most.
  mapWorld.insertBefore(measureCanvas, marquee);

  measureCtx = measureCanvas.getContext("2d");
}

function resizeMeasureCanvas(){
  if (!measureCanvas) return;

  const w = mapStage.clientWidth || 1;
  const h = mapStage.clientHeight || 1;
  const dpr = window.devicePixelRatio || 1;

  measureCanvas.width = Math.floor(w * dpr);
  measureCanvas.height = Math.floor(h * dpr);
  measureCanvas.style.width = `${w}px`;
  measureCanvas.style.height = `${h}px`;

  measureCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function clearMeasure(){
  if (!measureCanvas) return;
  resizeMeasureCanvas();
  measureCtx.clearRect(0, 0, mapStage.clientWidth || 1, mapStage.clientHeight || 1);
}

function distanceFeet(a, b){
  const g = vttState.grid || {};
  const size = Math.max(10, Number(g.size) || 70); // px per square
  const dx = (b.x - a.x);
  const dy = (b.y - a.y);
  const distPx = Math.hypot(dx, dy);
  const squares = distPx / size;
  const feet = squares * 5;
  return { squares, feet };
}

function drawMeasureLine(){
  ensureMeasureCanvas();
  resizeMeasureCanvas();
  clearMeasure();

  if (!measureState.dragging || !measureState.a || !measureState.b) return;

  const a = measureState.a;
  const b = measureState.b;

  // Line
  measureCtx.lineWidth = 2;
  measureCtx.strokeStyle = "rgba(201,162,39,0.95)";
  measureCtx.beginPath();
  measureCtx.moveTo(a.x, a.y);
  measureCtx.lineTo(b.x, b.y);
  measureCtx.stroke();

  // End caps
  measureCtx.fillStyle = "rgba(201,162,39,0.95)";
  measureCtx.beginPath();
  measureCtx.arc(a.x, a.y, 4, 0, Math.PI * 2);
  measureCtx.arc(b.x, b.y, 4, 0, Math.PI * 2);
  measureCtx.fill();

  // Readout
  const { squares, feet } = distanceFeet(a, b);
  const feetRounded = Math.round(feet / 5) * 5; // snap readout to 5ft steps
  if (measureReadout){
    measureReadout.hidden = false;
    measureReadout.textContent = `${feetRounded} ft (${squares.toFixed(1)} sq)`;
  }
}

// ---------- Boot ----------
function hydrateFromTracker() {
  const state = loadTrackerState();
  const enc = state?.encounter;

  roster = enc?.roster || [];

// Work out whose turn it is (only when encounter is running)
if (enc && enc.status === "running" && Array.isArray(enc.roster) && enc.roster.length) {
  const idx = Math.max(0, Math.min(enc.turnIndex || 0, enc.roster.length - 1));
  activeTurnEncId = enc.roster[idx]?.encId || null;
} else {
  activeTurnEncId = null;
}
  const name = enc?.name || "(unnamed encounter)";
  if (vttStatus) vttStatus.textContent = `Showing tokens for: ${name}`;

  if (btnToggleMonsters) {
    btnToggleMonsters.textContent = vttState.hideMonsters ? "Show monsters" : "Hide monsters";
  }

  ensureDefaultPositions();
  renderTokens();
}

applyCamera();
applyTokenSize();
updateGridUI();
drawGrid();
updateFogUI();
drawFog();
hydrateFromTracker();
