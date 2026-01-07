const STORAGE_KEY = "encounterTracker.v1";
const MAP_KEY = "encounterTracker.vtt.mapImage";

const el = (id) => document.getElementById(id);

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

const mapUpload = el("mapUpload");
const btnClearMap = el("btnClearMap");
const mapImage = el("mapImage");
const tokenLayer = el("tokenLayer");

function render() {
  const state = loadState();
  const enc = state?.encounter;
  const roster = enc?.roster || [];

  // Map image
  const mapData = loadMap();
  mapImage.src = mapData || "";
  mapImage.style.opacity = mapData ? "1" : "0";

  // Tokens on map
  tokenLayer.innerHTML = "";

  // Simple layout: line them up at the top-left if no saved positions yet
  roster.forEach((c, i) => {
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

    // Default positions
    const x = 20 + (i * 70);
    const y = 20;

    token.style.left = `${x}px`;
    token.style.top = `${y}px`;

    enableDrag(token);

    tokenLayer.appendChild(token);
  });

  // Also upgrade the “Encounter Tokens” list to show avatars (if you still have that section)
  const list = document.getElementById("tokenList");
  if (list) {
    list.innerHTML = "";
    roster.forEach((c) => {
      const row = document.createElement("div");
      row.className = "item";

      row.innerHTML = `
      <div id="tokenList"></div>
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
      list.appendChild(row);
    });
  }
}

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

mapUpload?.addEventListener("change", async () => {
  const file = mapUpload.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    saveMap(String(reader.result || ""));
    render();
    mapUpload.value = "";
  };
  reader.readAsDataURL(file);
});

btnClearMap?.addEventListener("click", () => {
  saveMap("");
  render();
});

window.addEventListener("storage", (e) => {
  // If tracker changes roster while battlemap is open, refresh tokens
  if (e.key === STORAGE_KEY) render();
});

render();
