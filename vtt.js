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
  const raw = localStorage.getItem(VTT_STATE_KEY);

  const fallback = {
    camera: { x: 0, y: 0, zoom: 1 },
    tokenPos: {},        // encId -> {x,y} normalized
    tokenSize: 56,
    hideMonsters: false
  };

  if (!raw) return fallback;

  try {
    const s = JSON.parse(raw) || {};
    s.camera ||= fallback.camera;
    s.tokenPos ||= {};
    s.tokenSize ??= 56;
    s.hideMonsters ??= false;
    return s;
  } catch {
    return fallback;
  }
}

let vttState = loadVttState();

function saveVttState() {
  localStorage.setItem(VTT_STATE_KEY, JSON.stringify(vttState));
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
let roster = [];
let selected = new Set(); // encIds
let tokenEls = new Map(); // encId -> element

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

    token.style.outline = selected.has(c.encId)
      ? "2px solid rgba(201,162,39,0.65)"
      : "none";

    enableTokenInput(token);

    tokenLayer.appendChild(token);
    tokenEls.set(c.encId, token);
  });
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
      if (selected.has(encId)) selected.delete(encId);
      else selected.add(encId);
    } else {
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
    const clampedPos = clampTokenToStage(t.left + dx, t.top + dy, tokenSize);

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

mapStage.addEventListener("pointerup", () => {
  camera.isPanning = false;
});

mapStage.addEventListener("pointercancel", () => {
  camera.isPanning = false;
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

btnToggleMonsters?.addEventListener("click", () => {
  vttState.hideMonsters = !vttState.hideMonsters;
  if (btnToggleMonsters) {
    btnToggleMonsters.textContent = vttState.hideMonsters ? "Show monsters" : "Hide monsters";
  }
  saveVttState();
  renderTokens();
});

document.addEventListener("fullscreenchange", () => {
  renderTokens();
});

// ---------- Resize stability ----------
const ro = new ResizeObserver(() => {
  renderTokens();
});
ro.observe(mapStage);

// ---------- Cross-tab updates ----------
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) hydrateFromTracker();
});

// ---------- Boot ----------
function hydrateFromTracker() {
  const state = loadTrackerState();
  const enc = state?.encounter;

  roster = enc?.roster || [];
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
hydrateFromTracker();
