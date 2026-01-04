/* Encounter Tracker MVP
   - Library stored in localStorage
   - Campaign export/import JSON
   - Basic PDF text extraction + naive parse (optional)
   - Encounter roster + initiative + turn runner
*/

const STORAGE_KEY = "encounterTracker.v1";

/* ---------- State load/save (robust, handles Sets) ---------- */
const state = loadState();

function saveState() {
  const toSave = {
    ...state,
    selectedLibraryIds: Array.from(state.selectedLibraryIds || [])
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);

  // Fresh install / empty storage
  if (!raw) {
    return {
      library: [],
      selectedLibraryIds: new Set(),
      savedEncounters: [],
      encounter: {
        name: "",
        status: "idle",
        roster: [],
        turnIndex: 0
      }
    };
  }

  // Existing saved state
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn("State JSON was corrupted; resetting.", e);
    localStorage.removeItem(STORAGE_KEY);
    return {
      library: [],
      selectedLibraryIds: new Set(),
      savedEncounters: [],
      encounter: {
        name: "",
        status: "idle",
        roster: [],
        turnIndex: 0
      }
    };
  }

  // Normalize fields
  parsed.library = Array.isArray(parsed.library) ? parsed.library : [];
  parsed.savedEncounters = Array.isArray(parsed.savedEncounters) ? parsed.savedEncounters : [];

  const ids = Array.isArray(parsed.selectedLibraryIds) ? parsed.selectedLibraryIds : [];
  parsed.selectedLibraryIds = new Set(ids);

  parsed.encounter = parsed.encounter || { name: "", status: "idle", roster: [], turnIndex: 0 };
  parsed.encounter.roster = Array.isArray(parsed.encounter.roster) ? parsed.encounter.roster : [];
  parsed.encounter.turnIndex = Number.isFinite(parsed.encounter.turnIndex) ? parsed.encounter.turnIndex : 0;
  parsed.encounter.status = parsed.encounter.status || "idle";
  parsed.encounter.name = parsed.encounter.name || "";

  return parsed;
}

/* ---------- Utilities ---------- */
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function d20() {
  return Math.floor(Math.random() * 20) + 1;
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

/* ---------- DOM helpers ---------- */
const el = (id) => document.getElementById(id);

const libraryList = el("libraryList");
const encList = el("encList");
const encStatus = el("encStatus");
const turnPill = el("turnPill");
const targetSelect = el("targetSelect");

const btnAddToLibrary = el("btnAddToLibrary");
const btnSaveEncounter = el("btnSaveEncounter");
const savedEncountersList = el("savedEncountersList");
const btnAddSelected = el("btnAddSelected");
const btnClearEncounter = el("btnClearEncounter");
const btnAutoInit = el("btnAutoInit");
const btnBegin = el("btnBegin");
const btnPause = el("btnPause");
const btnEnd = el("btnEnd");
const btnNextTurn = el("btnNextTurn");
const btnApplyDamage = el("btnApplyDamage");
const btnAddCondition = el("btnAddCondition");
const btnExportJson = el("btnExportJson");
const btnImportJson = el("btnImportJson");
const btnImportPdf = el("btnImportPdf");
const btnResetAll = el("btnResetAll");
const btnInstall = el("btnInstall");

const damageInput = el("damageInput");
const conditionInput = el("conditionInput");
const pdfStatus = el("pdfStatus");

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabPanel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    el(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

/* ---------- Render ---------- */
function render() {
  // counts
  const pcs = state.library.filter(x => x.type === "pc").length;
  const mons = state.library.filter(x => x.type === "monster").length;
  el("countPCs").textContent = `PCs: ${pcs}`;
  el("countMonsters").textContent = `Monsters: ${mons}`;

  // encounter name
  el("encName").value = state.encounter.name || "";

  // library list
  libraryList.innerHTML = "";
  if (state.library.length === 0) {
    libraryList.innerHTML = `<div class="hint">No combatants yet. Add one above or import a campaign JSON.</div>`;
  } else {
    state.library
      .slice()
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === "pc" ? -1 : 1)))
      .forEach(item => {
        const row = document.createElement("div");
        row.className = "item" + (state.selectedLibraryIds.has(item.id) ? " selected" : "");
        row.addEventListener("click", () => {
          if (state.selectedLibraryIds.has(item.id)) state.selectedLibraryIds.delete(item.id);
          else state.selectedLibraryIds.add(item.id);
          saveState();
          render();
        });

        const img = document.createElement("img");
        img.className = "avatar";
        img.alt = item.name;
        img.src = item.avatar || defaultAvatar(item.type);
        img.onerror = () => img.src = defaultAvatar(item.type);

        const main = document.createElement("div");
        main.className = "itemMain";
        main.innerHTML = `
          <div class="itemTitle">${escapeHtml(item.name)}</div>
          <div class="itemMeta">
            <span class="badge ${item.type}">${item.type.toUpperCase()}</span>
            <span class="badge">HP: ${item.maxHp}</span>
            ${Number.isFinite(item.initBonus) ? `<span class="badge">Init+${item.initBonus}</span>` : ""}
          </div>
        `;

        const actions = document.createElement("div");
        actions.className = "itemActions";

        const del = document.createElement("button");
        del.className = "btn ghost";
        del.textContent = "Delete";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          state.library = state.library.filter(x => x.id !== item.id);
          state.selectedLibraryIds.delete(item.id);
          saveState();
          render();
        });

        actions.appendChild(del);

        row.appendChild(img);
        row.appendChild(main);
        row.appendChild(actions);
        libraryList.appendChild(row);
      });
  }

  // status text
  const enc = state.encounter;
  const statusText = {
    idle: "Encounter not started. Add combatants, roll initiative, then begin.",
    ready: "Ready. Roll initiative if needed, then begin.",
    running: "Running. Apply damage/conditions and move through turns.",
    paused: "Paused. Resume by pressing Begin.",
    ended: "Ended. Clear or build a new encounter."
  }[enc.status] || "";

  encStatus.textContent = statusText;

  // button enablement
  btnPause.disabled = !(enc.status === "running");
  btnEnd.disabled = !(enc.status === "running" || enc.status === "paused");
  btnBegin.disabled = !(enc.roster.length > 0) || (enc.status === "running");
  btnAutoInit.disabled = !(enc.roster.length > 0) || (enc.status === "running");
  btnNextTurn.disabled = !(enc.status === "running");
  btnApplyDamage.disabled = !(enc.status === "running");
  btnAddCondition.disabled = !(enc.status === "running");

  // turn pill
  if (enc.status !== "running" || enc.roster.length === 0) {
    turnPill.textContent = (enc.status === "paused") ? "Paused" : "Not started";
  } else {
    const current = enc.roster[enc.turnIndex];
    turnPill.textContent = current ? `${current.name} (Init ${current.init})` : "—";
  }

  // encounter list
  encList.innerHTML = "";
  if (enc.roster.length === 0) {
    encList.innerHTML = `<div class="hint">No one in the encounter yet. Select from Storage and add them.</div>`;
  } else {
    enc.roster.forEach((c, idx) => {
      const row = document.createElement("div");
      const isCurrent = (enc.status === "running" && idx === enc.turnIndex);
      row.className = "item" +
        (isCurrent ? " currentTurn" : "") +
        (c.defeated ? " defeatedRow" : "");

      row.addEventListener("click", () => {
        targetSelect.value = c.encId;
      });

      const img = document.createElement("img");
      img.className = "avatar";
      img.alt = c.name;
      img.src = c.avatar || defaultAvatar(c.type);
      img.onerror = () => img.src = defaultAvatar(c.type);

      const main = document.createElement("div");
      main.className = "itemMain";

      const condText = (c.conditions && c.conditions.length)
        ? c.conditions.map(x => `<span class="badge">${escapeHtml(x)}</span>`).join(" ")
        : `<span class="badge">No conditions</span>`;

      main.innerHTML = `
        <div class="itemTitle">
          ${escapeHtml(c.name)}
          ${c.defeated ? ` <span class="badge defeated">DEFEATED</span>` : ""}
        </div>
        <div class="itemMeta">
          <span class="badge ${c.type}">${c.type.toUpperCase()}</span>
          <span class="badge">Init: ${c.init ?? "—"}</span>
          <span class="badge">HP: ${c.curHp}/${c.maxHp}</span>
        </div>
        <div class="itemMeta">${condText}</div>
      `;

      const actions = document.createElement("div");
      actions.className = "itemActions";

      const remove = document.createElement("button");
      remove.className = "btn ghost";
      remove.textContent = "Remove";
      remove.disabled = (enc.status === "running");
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        enc.roster = enc.roster.filter(x => x.encId !== c.encId);
        normalizeEncounterAfterRosterChange();
        saveState();
        render();
      });

      actions.appendChild(remove);

      row.appendChild(img);
      row.appendChild(main);
      row.appendChild(actions);
      encList.appendChild(row);
    });
  }

  // target dropdown
  targetSelect.innerHTML = "";
  enc.roster.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.encId;
    opt.textContent = `${c.name} (${c.type})`;
    targetSelect.appendChild(opt);
  });

  if (enc.roster.length > 0) {
    const exists = enc.roster.some(x => x.encId === targetSelect.value);
    if (!exists) targetSelect.value = enc.roster[0].encId;
  }

  // Saved encounters list (for Encounters tab)
  if (savedEncountersList) {
    savedEncountersList.innerHTML = "";

    if (!state.savedEncounters || state.savedEncounters.length === 0) {
      savedEncountersList.innerHTML =
        `<div class="hint">No saved encounters yet. Save one from an active roster.</div>`;
    } else {
      state.savedEncounters
        .slice()
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
        .forEach(se => {
          const row = document.createElement("div");
          row.className = "item";

          const main = document.createElement("div");
          main.className = "itemMain";
          main.innerHTML = `
            <div class="itemTitle">${escapeHtml(se.name || "Untitled Encounter")}</div>
            <div class="itemMeta">
              <span class="badge">${(se.roster || []).length} combatants</span>
              <span class="badge">Monsters: ${(se.roster || []).filter(x => x.type === "monster").length}</span>
              <span class="badge">PCs: ${(se.roster || []).filter(x => x.type === "pc").length}</span>
            </div>
          `;

          const actions = document.createElement("div");
          actions.className = "itemActions";

          const loadBtn = document.createElement("button");
          loadBtn.className = "btn";
          loadBtn.textContent = "Load";
          loadBtn.addEventListener("click", () => {
            const ok = confirm("Load this encounter? This will replace the current roster.");
            if (!ok) return;

            state.encounter.name = se.name || "";
            state.encounter.roster = (se.roster || []).map(x => ({
              ...x,
              encId: uid(),
              curHp: x.maxHp,
              conditions: [],
              defeated: false
            }));
            state.encounter.turnIndex = 0;
            state.encounter.status = "ready";

            saveState();
            render();
          });

          const dupBtn = document.createElement("button");
          dupBtn.className = "btn ghost";
          dupBtn.textContent = "Duplicate";
          dupBtn.addEventListener("click", () => {
            state.savedEncounters.push({
              ...se,
              id: uid(),
              name: (se.name || "Encounter") + " (copy)",
              updatedAt: new Date().toISOString()
            });
            saveState();
            render();
          });

          const delBtn = document.createElement("button");
          delBtn.className = "btn ghost";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", () => {
            const ok = confirm("Delete this saved encounter?");
            if (!ok) return;
            state.savedEncounters = state.savedEncounters.filter(e => e.id !== se.id);
            saveState();
            render();
          });

          actions.appendChild(loadBtn);
          actions.appendChild(dupBtn);
          actions.appendChild(delBtn);

          row.appendChild(main);
          row.appendChild(actions);
          savedEncountersList.appendChild(row);
        });
    }
  }
}

function normalizeEncounterAfterRosterChange() {
  const enc = state.encounter;
  enc.turnIndex = clamp(enc.turnIndex, 0, Math.max(0, enc.roster.length - 1));
  if (enc.roster.length === 0) enc.status = "idle";
}

/* ---------- Library actions ---------- */
btnAddToLibrary.addEventListener("click", () => {
  const name = el("newName").value.trim();
  const type = el("newType").value;
  const maxHp = Number(el("newMaxHp").value);
  const initBonusRaw = el("newInitBonus").value.trim();
  const avatar = el("newAvatar").value.trim();

  if (!name || !Number.isFinite(maxHp) || maxHp <= 0) {
    alert("Please enter a Name and a valid Max HP.");
    return;
  }

  const initBonus = initBonusRaw === "" ? null : Number(initBonusRaw);

  state.library.push({
    id: uid(),
    name,
    type,
    maxHp: Math.floor(maxHp),
    curHp: Math.floor(maxHp),
    initBonus: (initBonusRaw === "" || !Number.isFinite(initBonus)) ? null : Math.floor(initBonus),
    avatar: avatar || ""
  });

  el("newName").value = "";
  el("newMaxHp").value = "";
  el("newInitBonus").value = "";
  el("newAvatar").value = "";

  saveState();
  render();
});

btnAddSelected.addEventListener("click", () => {
  const ids = Array.from(state.selectedLibraryIds);
  if (ids.length === 0) {
    alert("Select one or more combatants from Storage first.");
    return;
  }

  const enc = state.encounter;
  ids.forEach(id => {
    const base = state.library.find(x => x.id === id);
    if (!base) return;

    enc.roster.push({
      encId: uid(),
      baseId: base.id,
      name: base.name,
      type: base.type,
      maxHp: base.maxHp,
      curHp: base.maxHp,
      init: null,
      avatar: base.avatar || "",
      conditions: [],
      defeated: false
    });
  });

  enc.status = "ready";
  saveState();
  render();
});

btnClearEncounter.addEventListener("click", () => {
  if (!confirm("Clear the encounter roster?")) return;
  state.encounter.roster = [];
  state.encounter.turnIndex = 0;
  state.encounter.status = "idle";
  saveState();
  render();
});

el("encName").addEventListener("input", (e) => {
  state.encounter.name = e.target.value;
  saveState();
});

/* ---------- Initiative + Encounter flow ---------- */
btnAutoInit.addEventListener("click", () => {
  const enc = state.encounter;

  enc.roster.forEach(c => {
    const base = state.library.find(x => x.id === c.baseId);
    const bonus = (base && Number.isFinite(base.initBonus)) ? base.initBonus : 0;
    c.init = d20() + bonus;
  });

  enc.roster.sort((a, b) => (b.init - a.init) || a.name.localeCompare(b.name));
  enc.turnIndex = 0;
  enc.status = "ready";
  saveState();
  render();
});

btnBegin.addEventListener("click", () => {
  const enc = state.encounter;
  if (enc.roster.length === 0) return;

  enc.roster.forEach(c => { if (c.init == null) c.init = 0; });
  enc.roster.sort((a, b) => (b.init - a.init) || a.name.localeCompare(b.name));

  enc.status = "running";
  enc.turnIndex = findNextLivingIndex(enc, enc.turnIndex);

  saveState();
  render();
  checkAutoEnd();
});

btnPause.addEventListener("click", () => {
  state.encounter.status = "paused";
  saveState();
  render();
});

btnEnd.addEventListener("click", () => {
  state.encounter.status = "ended";
  saveState();
  render();
});

btnNextTurn.addEventListener("click", () => {
  const enc = state.encounter;
  if (enc.status !== "running") return;

  enc.turnIndex = findNextLivingIndex(enc, enc.turnIndex + 1);
  saveState();
  render();
  checkAutoEnd();
});

function findNextLivingIndex(enc, startIndex) {
  if (enc.roster.length === 0) return 0;

  let idx = ((startIndex % enc.roster.length) + enc.roster.length) % enc.roster.length;
  for (let i = 0; i < enc.roster.length; i++) {
    const c = enc.roster[idx];
    if (c && !c.defeated) return idx;
    idx = (idx + 1) % enc.roster.length;
  }
  return 0;
}

/* ---------- Damage + Conditions ---------- */
btnApplyDamage.addEventListener("click", () => applyDamageAndConditions(false));
btnAddCondition.addEventListener("click", () => applyDamageAndConditions(true));

function applyDamageAndConditions(conditionOnly) {
  const enc = state.encounter;
  if (enc.status !== "running") return;

  const targetId = targetSelect.value;
  const target = enc.roster.find(x => x.encId === targetId);
  if (!target) return;

  if (!conditionOnly) {
    const dmgRaw = damageInput.value.trim();
    if (dmgRaw !== "") {
      const dmg = Number(dmgRaw);
      if (!Number.isFinite(dmg)) {
        alert("Damage must be a number.");
        return;
      }
      const nextHp = clamp(target.curHp - Math.floor(dmg), 0, target.maxHp);
      target.curHp = nextHp;
      damageInput.value = "";
    }
  }

  const cond = conditionInput.value.trim();
  if (cond) {
    target.conditions = target.conditions || [];
    if (!target.conditions.includes(cond)) target.conditions.push(cond);
    conditionInput.value = "";
  }

  if (target.curHp <= 0) target.defeated = true;

  saveState();
  render();
  checkAutoEnd();
}

function checkAutoEnd() {
  const enc = state.encounter;
  if (enc.status !== "running") return;

  const monsters = enc.roster.filter(x => x.type === "monster");
  if (monsters.length === 0) return;

  const allDefeated = monsters.every(m => m.defeated || m.curHp <= 0);
  if (allDefeated) {
    enc.status = "ended";
    saveState();
    render();
  }
}

/* ---------- Import / Export JSON ---------- */
function exportCampaignJson() {
  return {
    schema: "encounter-tracker-campaign@1",
    exportedAt: new Date().toISOString(),
    library: state.library
  };
}

btnExportJson.addEventListener("click", () => {
  const data = exportCampaignJson();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `campaign-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

btnImportJson.addEventListener("click", async () => {
  const file = el("importJson").files?.[0];
  if (!file) { alert("Choose a JSON file first."); return; }

  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { alert("That JSON file could not be parsed."); return; }

  if (!parsed || !Array.isArray(parsed.library)) {
    alert("This does not look like a valid campaign export for this app.");
    return;
  }

  const existingKey = new Set(state.library.map(x => `${x.name}|${x.type}|${x.maxHp}`));
  parsed.library.forEach(x => {
    const key = `${x.name}|${x.type}|${x.maxHp}`;
    if (!existingKey.has(key)) {
      state.library.push({
        id: uid(),
        name: x.name,
        type: x.type,
        maxHp: Math.floor(Number(x.maxHp) || 1),
        curHp: Math.floor(Number(x.maxHp) || 1),
        initBonus: (x.initBonus == null ? null : Math.floor(Number(x.initBonus))),
        avatar: x.avatar || ""
      });
      existingKey.add(key);
    }
  });

  saveState();
  render();
  alert("Campaign imported.");
});

/* ---------- PDF Import (basic) ---------- */
btnImportPdf.addEventListener("click", async () => {
  const file = el("importPdf").files?.[0];
  if (!file) { alert("Choose a PDF first."); return; }
  if (!window.pdfjsLib) { alert("pdf.js failed to load."); return; }

  if (pdfStatus) pdfStatus.textContent = "Extracting text from PDF…";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const strings = content.items.map(it => it.str);
      fullText += "\n" + strings.join(" ");
    }

    const hpMatch = fullText.match(/(?:Hit Points|HP)\s*[:\-]?\s*(\d{1,4})/i);
    const hp = hpMatch ? Number(hpMatch[1]) : null;

    const firstChunk = fullText.replace(/\s+/g, " ").trim().slice(0, 220);
    const nameMatch = firstChunk.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})/);
    const name = nameMatch ? nameMatch[1] : "Imported Creature";

    const maxHp = hp ? Math.floor(hp) : 10;

    state.library.push({
      id: uid(),
      name,
      type: "monster",
      maxHp,
      curHp: maxHp,
      initBonus: null,
      avatar: ""
    });

    saveState();
    render();

    if (pdfStatus) {
      pdfStatus.textContent = hp ? `Imported: ${name} (HP ${hp})` : "Text extracted, HP not found. Imported with HP 10.";
    }
  } catch (e) {
    console.error(e);
    if (pdfStatus) pdfStatus.textContent = "PDF import failed. (JSON import is reliable.)";
  }
});

/* ---------- Reset ---------- */
btnResetAll.addEventListener("click", () => {
  if (!confirm("This will wipe your library and encounter data from this device/browser. Continue?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

/* ---------- PWA install prompt ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnInstall) btnInstall.hidden = false;
});
if (btnInstall) {
  btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btnInstall.hidden = true;
  });
}

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      console.warn("SW registration failed", e);
    }
  });
}

/* ---------- Boot ---------- */
if (btnSaveEncounter) {
  btnSaveEncounter.addEventListener("click", () => {
    const enc = state.encounter;

    if (!enc.roster || enc.roster.length === 0) {
      alert("Add combatants to the encounter first, then save.");
      return;
    }

    const name = (enc.name || "").trim() || `Encounter ${state.savedEncounters.length + 1}`;

    const snapshot = {
      id: uid(),
      name,
      updatedAt: new Date().toISOString(),
      roster: enc.roster.map(c => ({
        baseId: c.baseId || null,
        name: c.name,
        type: c.type,
        maxHp: c.maxHp,
        curHp: c.maxHp,        // reset HP on load
        init: c.init ?? null,  // keep initiative if rolled
        avatar: c.avatar || "",
        conditions: [],
        defeated: false
      }))
    };

    state.savedEncounters.push(snapshot);
    saveState();
    render();
    alert(`Saved: ${name}`);
  });
}
render();
