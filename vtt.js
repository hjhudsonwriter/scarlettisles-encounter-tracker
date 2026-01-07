const STORAGE_KEY = "encounterTracker.v1";
const MAP_KEY = "encounterTracker.vtt.mapImage";

const el = (id) => document.getElementById(id);

const mapUpload = el("mapUpload");
const mapImage = el("mapImage");
const btnClearMap = el("btnClearMap");
const tokenLayer = el("tokenLayer");
const statusEl = el("vttStatus");
const tokenList = el("vttTokenList");

/* ---------- Helpers ---------- */
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

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function loadMap() {
  return localStorage.getItem(MAP_KEY) || "";
}

function saveMap(dataUrl) {
  if (dataUrl) localStorage.setItem(MAP_KEY, dataUrl);
  else localStorage.removeItem(MAP_KEY);
}

/* ---------- Drag ---------- */
function enableDrag(tokenEl) {
  let startX = 0, startY = 0;
  let originLeft = 0, originTop = 0;
  let dragging = false;

  const onDown = (e) => {
    dragging = true;
    tokenEl.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    originLeft = parseFloat(tokenEl.style.left || "0");
    originTop = parseFloat(tokenEl.style.top || "0");
  };

  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    tokenEl.style.left = `${originLeft + dx}px`;
    tokenEl.style.top = `${originTop + dy}px`;
  };

  const onUp = () => { dragging = false; };

  tokenEl.addEventListener("pointerdown", onDown);
  tokenEl.addEventListener("pointermove", onMove);
  tokenEl.addEventListener("pointerup", onUp);
  tokenEl.addEventListener("pointercancel", onUp);
}

/* ---------- Render ---------- */
function render() {
  const state = loadState();
  const enc = state?.encounter;
  const roster = enc?.roster || [];

  if (statusEl) {
    const name = (enc?.name || "").trim() || "unnamed encounter";
    statusEl.textContent = `Showing tokens for: ${name}`;
  }

  // Map
  const mapData = loadMap();
  if (mapData) {
    mapImage.src = mapData;
    mapImage.style.display = "block";
  } else {
    mapImage.removeAttribute("src");
    mapImage.style.display = "none";
  }

  // Tokens on map
  tokenLayer.innerHTML = "";

  roster.forEach((c, i) => {
    const token = document.createElement("div");
    token.className = "token";
    token.dataset.encId = c.encId;

    const img = document.createElement("img");
    img.src = c.avatar || defaultAvatar(c.type);
    img.onerror = () => (img.src = defaultAvatar(c.type));

    token.appendChild(img);

    // Default positions (simple lineup)
    token.style.left = `${20 + i * 70}px`;
    token.style.top = `20px`;

    enableDrag(token);
    tokenLayer.appendChild(token);
  });

  // Token list (below)
  if (tokenList) {
    tokenList.innerHTML = "";
    roster.forEach((c) => {
      const row = document.createElement("div");
      row.className = "item";

      row.innerHTML = `
        <div class="tokenListRow">
          <img src="${c.avatar || defaultAvatar(c.type)}" alt="">
          <div>
            <div class="itemTitle">${c.name}</div>
            <div class="itemMeta">
              <span class="badge ${c.type}">${String(c.type).toUpperCase()}</span>
              <span class="badge">HP: ${c.curHp}/${c.maxHp}</span>
            </div>
          </div>
        </div>
      `;

      tokenList.appendChild(row);
    });
  }
}

/* ---------- Events ---------- */
// Upload battlemap
mapUpload?.addEventListener("change", () => {
  const file = mapUpload.files?.[0];
  if (!file) return;

  // Guard: localStorage is limited. Keep files reasonable.
  if (file.size > 4 * 1024 * 1024) {
    alert("That image is quite large. Try a smaller JPG/PNG (under ~4MB).");
    mapUpload.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    saveMap(String(reader.result || ""));
    render();
    mapUpload.value = "";
  };
  reader.readAsDataURL(file);
});

// Clear battlemap
btnClearMap?.addEventListener("click", () => {
  saveMap("");
  render();
});

// Live update if tracker changes while this tab is open
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) render();
});

render();
