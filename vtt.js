/* Scarlett Isles – VTT (starter)
   Reads the same localStorage state as the tracker and lists the roster.
   Later: grid, drag/drop tokens, fog-of-war.
*/

const STORAGE_KEY = "encounterTracker.v1";

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  const statusEl = document.getElementById("vttStatus");
  const listEl = document.getElementById("vttTokenList");

  const state = loadState();
  const roster = state?.encounter?.roster || [];
  const encName = state?.encounter?.name || "(unnamed encounter)";

  if (statusEl) {
    statusEl.textContent = roster.length
      ? `Showing tokens for: ${encName}`
      : `No encounter roster found. Add combatants in the tracker first.`;
  }

  if (!listEl) return;

  listEl.innerHTML = "";

  if (!roster.length) {
    listEl.innerHTML = `<div class="hint">Nothing to show yet.</div>`;
    return;
  }

  roster.forEach(c => {
    const row = document.createElement("div");
    row.className = "item";

    const main = document.createElement("div");
    main.className = "itemMain";
    main.innerHTML = `
      <div class="itemTitle">${escapeHtml(c.name || "Unknown")}</div>
      <div class="itemMeta">
        <span class="badge ${c.type}">${(c.type || "").toUpperCase()}</span>
        <span class="badge">HP: ${c.curHp ?? c.maxHp ?? "—"}/${c.maxHp ?? "—"}</span>
      </div>
    `;

    row.appendChild(main);
    listEl.appendChild(row);
  });
}

// Initial render
render();

// IMPORTANT: keeps VTT in sync when tracker changes localStorage
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) render();
});

// Also re-render when you refocus the window (handy if browser doesn't fire storage reliably)
window.addEventListener("focus", render);
