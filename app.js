/* Scarlett Isles – Encounter Tracker
   Clean rebuild of app.js
   - No event listeners inside render()
   - Robust localStorage state
   - Complete Turn: applies to selected target, then advances turn
   - Conditions with turn countdown (ticks down when that combatant ends their turn)
   - Center board rows rendered as true 6-column grid (prevents REMOVE overlap)
*/

const STORAGE_KEY = "encounterTracker.v1";

/* ---------- Utilities ---------- */
const el = (id) => document.getElementById(id);

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

/* ---------- State ---------- */
function defaultState() {
  return {
    library: [],
    selectedLibraryIds: new Set(),
    savedEncounters: [],
    encounter: {
      name: "",
      status: "idle", // idle | ready | running | paused | ended
      roster: [],
      turnIndex: 0,
      round: 1
    },
    ui: {
      targetId: null
    }
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);

    const s = defaultState();
    s.library = Array.isArray(parsed.library) ? parsed.library : [];
    s.savedEncounters = Array.isArray(parsed.savedEncounters) ? parsed.savedEncounters : [];

    const ids = Array.isArray(parsed.selectedLibraryIds) ? parsed.selectedLibraryIds : [];
    s.selectedLibraryIds = new Set(ids);

    const enc = parsed.encounter || {};
    s.encounter.name = typeof enc.name === "string" ? enc.name : "";
    s.encounter.status = enc.status || "idle";
    s.encounter.roster = Array.isArray(enc.roster) ? enc.roster : [];
    s.encounter.turnIndex = Number.isFinite(enc.turnIndex) ? enc.turnIndex : 0;
    s.encounter.round = Number.isFinite(enc.round) ? enc.round : 1;

    const ui = parsed.ui || {};
    s.ui.targetId = typeof ui.targetId === "string" ? ui.targetId : null;

    // Safety normalisation for roster entries
    s.encounter.roster.forEach(c => {
      c.conditions = Array.isArray(c.conditions) ? c.conditions : [];
      c.defeated = !!c.defeated;
      c.curHp = Number.isFinite(c.curHp) ? c.curHp : c.maxHp;
      c.maxHp = Number.isFinite(c.maxHp) ? c.maxHp : 1;
    });

    return s;
  } catch (e) {
    console.warn("State was corrupted; resetting.", e);
    localStorage.removeItem(STORAGE_KEY);
    return defaultState();
  }
}

const state = loadState();

let editingLibraryId = null;

function setAddFormFromCombatant(c) {
  el("newName").value = c.name || "";
  el("newType").value = c.type || "pc";
  el("newMaxHp").value = c.maxHp ?? "";
  el("newInitBonus").value = (c.initBonus ?? "");
  el("newAvatar").value = c.avatar || "";
}

function resetAddForm() {
  editingLibraryId = null;
  el("newName").value = "";
  el("newMaxHp").value = "";
  el("newInitBonus").value = "";
  el("newAvatar").value = "";
  btnAddToLibrary.textContent = "Add to Library";
  if (btnCancelEdit) btnCancelEdit.hidden = true;
}

function saveState() {
  const toSave = {
    ...state,
    selectedLibraryIds: Array.from(state.selectedLibraryIds || []),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

// DM buttons
document.getElementById("btnMonstersHide")?.addEventListener("click", () => {
  saveVttState({ hideMonsters: true });
});

document.getElementById("btnMonstersReveal")?.addEventListener("click", () => {
  saveVttState({ hideMonsters: false, hidden: {} });
});


/* ---------- DOM refs ---------- */
const libraryList = el("libraryList");
const savedEncountersList = el("savedEncountersList");
const encList = el("encList");
const encStatus = el("encStatus");
const turnPill = el("turnPill");
const targetSelect = el("targetSelect");

const btnAddToLibrary = el("btnAddToLibrary");
const btnCancelEdit = el("btnCancelEdit");
const btnAddSelected = el("btnAddSelected");
const btnClearEncounter = el("btnClearEncounter");
const btnAutoInit = el("btnAutoInit");
const btnBegin = el("btnBegin");
const btnPause = el("btnPause");
const btnEnd = el("btnEnd");
const btnSaveEncounter = el("btnSaveEncounter");
const btnAddCondition = el("btnAddCondition");
const btnCompleteTurn = el("btnCompleteTurn");
const btnExportJson = el("btnExportJson");
const btnImportJson = el("btnImportJson");
const btnImportPdf = el("btnImportPdf");
const btnResetAll = el("btnResetAll");
const btnInstall = el("btnInstall");
const btnOpenVtt = el("btnOpenVtt");

const damageInput = el("damageInput");
const conditionInput = el("conditionInput");
const conditionTurns = el("conditionTurns");
const pdfStatus = el("pdfStatus");

const inspectorAvatar = el("inspectorAvatar");
const inspectorName = el("inspectorName");
const inspectorMeta = el("inspectorMeta");
const inspectorStats = el("inspectorStats");
const inspectorHp = el("inspectorHp");
const inspectorConds = el("inspectorConds");
const momentumText = el("momentumText");
// ---------- VTT DM controls (tracker side) ----------
const VTT_STATE_KEY = "encounterTracker.vtt.state";

function loadVttState() {
  try {
    return JSON.parse(localStorage.getItem(VTT_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveVttState(patch) {
  const s = loadVttState();
  const next = { ...s, ...patch };
  localStorage.setItem(VTT_STATE_KEY, JSON.stringify(next));
}

document.getElementById("btnMonstersHide")?.addEventListener("click", () => {
  saveVttState({ hideMonsters: true });
});

document.getElementById("btnMonstersReveal")?.addEventListener("click", () => {
  saveVttState({ hideMonsters: false });
});

/* ---------- Core helpers ---------- */
function getCurrentCombatant() {
  const enc = state.encounter;
  if (enc.status !== "running") return null;
  if (!enc.roster.length) return null;
  return enc.roster[enc.turnIndex] || null;
}

function loadVttState() {
  try {
    return JSON.parse(localStorage.getItem(VTT_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveVttState(patch) {
  const s = loadVttState();
  const next = { ...s, ...patch };
  localStorage.setItem(VTT_STATE_KEY, JSON.stringify(next));
}

function findNextLivingIndex(enc, startIndex) {
  if (!enc.roster.length) return 0;

  let idx = ((startIndex % enc.roster.length) + enc.roster.length) % enc.roster.length;
  for (let i = 0; i < enc.roster.length; i++) {
    const c = enc.roster[idx];
    if (c && !c.defeated && c.curHp > 0) return idx;
    idx = (idx + 1) % enc.roster.length;
  }
  return 0;
}

function tickDownConditionsForCombatant(combatant) {
  if (!combatant || !Array.isArray(combatant.conditions)) return;

  combatant.conditions = combatant.conditions
    .map(c => {
      if (typeof c === "string") return c; // backward compatibility
      const rem = Number.isFinite(c.remaining) ? c.remaining : 1;
      return { ...c, remaining: rem - 1 };
    })
    .filter(c => (typeof c === "string") || (c.remaining > 0));
}

function normalizeEncounterAfterRosterChange() {
  const enc = state.encounter;
  enc.turnIndex = clamp(enc.turnIndex, 0, Math.max(0, enc.roster.length - 1));
  if (enc.roster.length === 0) {
    enc.status = "idle";
    enc.turnIndex = 0;
    enc.round = 1;
  }
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

/* ---------- Damage + Conditions ---------- */
function applyDamageAndMaybeCondition({ conditionOnly }) {
  const enc = state.encounter;
  if (enc.status !== "running") return;

  const targetId = targetSelect?.value;
  if (!targetId) return;

  const target = enc.roster.find(x => x.encId === targetId);
  if (!target) return;

  // Damage / Healing
  if (!conditionOnly) {
    const dmgRaw = (damageInput?.value ?? "").trim();
    if (dmgRaw !== "") {
      const dmg = Number(dmgRaw);
      if (!Number.isFinite(dmg)) {
        alert("Damage must be a number.");
        return;
      }
      // Positive = damage, negative = healing (so subtract dmg)
      target.curHp = clamp(target.curHp - Math.floor(dmg), 0, target.maxHp);
      damageInput.value = "";
    }
  }

  // Condition + Turns
  const cond = (conditionInput?.value ?? "").trim();
  if (cond) {
    const turnsRaw = (conditionTurns?.value ?? "").trim();
    const turns = turnsRaw === "" ? 1 : Number(turnsRaw);

    if (!Number.isFinite(turns) || turns < 1) {
      alert("Turns must be 1 or more.");
      return;
    }

    target.conditions = Array.isArray(target.conditions) ? target.conditions : [];
    const existing = target.conditions.find(x => (typeof x === "object" ? x.name : x) === cond);

    if (existing && typeof existing === "object") {
      existing.remaining = Math.floor(turns);
    } else if (!existing) {
      target.conditions.push({ name: cond, remaining: Math.floor(turns) });
    }

    conditionInput.value = "";
    conditionTurns.value = "";
  }

  if (target.curHp <= 0) target.defeated = true;
}

/* ---------- Render ---------- */
function render() {
  // Counts
  const pcs = state.library.filter(x => x.type === "pc").length;
  const mons = state.library.filter(x => x.type === "monster").length;
  el("countPCs").textContent = `PCs: ${pcs}`;
  el("countMonsters").textContent = `Monsters: ${mons}`;

  // Encounter name
  el("encName").value = state.encounter.name || "";

  // Status text
  const enc = state.encounter;
  const statusText = {
    idle: "Encounter not started. Add combatants, roll initiative, then begin.",
    ready: "Ready. Roll initiative if needed, then begin.",
    running: "Running. Apply damage/conditions and move through turns.",
    paused: "Paused. Resume by pressing Begin.",
    ended: "Ended. Clear or build a new encounter."
  }[enc.status] || "";
  encStatus.textContent = statusText;

  // Buttons enablement
  btnPause.disabled = !(enc.status === "running");
  btnEnd.disabled = !(enc.status === "running" || enc.status === "paused");
  btnBegin.disabled = !(enc.roster.length > 0) || (enc.status === "running");
  btnAutoInit.disabled = !(enc.roster.length > 0) || (enc.status === "running");
  btnAddCondition.disabled = !(enc.status === "running");
  btnCompleteTurn.disabled = !(enc.status === "running");

  // Turn pill + inspector
  const current = getCurrentCombatant();
  if (!current) {
    turnPill.textContent = (enc.status === "paused") ? "Paused" : "Not started";

    inspectorName.textContent = "No active turn";
    inspectorMeta.textContent = "Start an encounter to see the active combatant.";
    inspectorAvatar.src = defaultAvatar("pc");
    inspectorStats.hidden = true;
  } else {
    turnPill.textContent = `${current.name} (Init ${current.init ?? "—"})`;

    inspectorName.textContent = current.name;
    inspectorMeta.textContent = `${current.type.toUpperCase()} • Init ${current.init ?? "—"} • Round ${enc.round}`;
    inspectorAvatar.src = current.avatar || defaultAvatar(current.type);
    inspectorAvatar.onerror = () => (inspectorAvatar.src = defaultAvatar(current.type));
    inspectorStats.hidden = false;
    inspectorHp.textContent = `HP: ${current.curHp}/${current.maxHp}`;

    const condHtml =
      current.conditions && current.conditions.length
        ? current.conditions
            .map(x => {
              if (typeof x === "string") return `<span class="badge">${escapeHtml(x)}</span>`;
              return `<span class="badge">${escapeHtml(x.name)} (${x.remaining})</span>`;
            })
            .join(" ")
        : `<span class="badge">—</span>`;
    inspectorConds.innerHTML = condHtml;
  }

  // Momentum
  if (momentumText) {
    const total = enc.roster.length;
    const monstersLeft = enc.roster.filter(x => x.type === "monster" && !x.defeated && x.curHp > 0).length;
    momentumText.textContent =
      total === 0
        ? "Add combatants to begin tracking."
        : `Combatants: ${total} • Monsters left: ${monstersLeft}` + (enc.status === "running" ? ` • Round: ${enc.round}` : "");
  }

  // Library list
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
        row.addEventListener("click", (e) => {
  // SHIFT + click = edit
  if (e.shiftKey) {
    editingLibraryId = item.id;
    setAddFormFromCombatant(item);
    btnAddToLibrary.textContent = "Save Changes";
    if (btnCancelEdit) btnCancelEdit.hidden = false;
    return;
  }

  // normal click = select/deselect
  if (state.selectedLibraryIds.has(item.id)) state.selectedLibraryIds.delete(item.id);
  else state.selectedLibraryIds.add(item.id);
  saveState();
  render();
});

        const img = document.createElement("img");
        img.className = "avatar";
        img.alt = item.name;
        img.src = item.avatar || defaultAvatar(item.type);
        img.onerror = () => (img.src = defaultAvatar(item.type));

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

  // Encounter board (CENTER) – build as true 6-column grid rows
  encList.innerHTML = "";
  if (enc.roster.length === 0) {
    encList.innerHTML = `<div class="hint">No one in the encounter yet. Select from Storage and add them.</div>`;
  } else {
    enc.roster.forEach((c, idx) => {
      const isCurrent = (enc.status === "running" && idx === enc.turnIndex);

      const row = document.createElement("div");
      row.className =
        "item" +
        (isCurrent ? " currentTurn" : "") +
        (c.defeated ? " defeatedRow" : "");

      // Make the row a 6-col grid via CSS selectors you already have (.boardList .item uses grid)
      // Children will match header columns:
      // [avatar] [init] [name] [hp] [conditions] [actions]

      row.addEventListener("click", () => {
        state.ui.targetId = c.encId;
        saveState();
        render();
      });

      // Avatar
      const img = document.createElement("img");
      img.className = "avatar";
      img.alt = c.name;
      img.src = c.avatar || defaultAvatar(c.type);
      img.onerror = () => (img.src = defaultAvatar(c.type));

      // Init
      const initCell = document.createElement("div");
      initCell.className = "boardCell";
      initCell.textContent = c.init ?? "—";

      // Name
      const nameCell = document.createElement("div");
      nameCell.className = "boardName";
      nameCell.innerHTML = `
        <span class="nameText">${escapeHtml(c.name)}</span>
        ${c.defeated ? `<span class="badge defeated">DEFEATED</span>` : ""}
        <span class="badge ${c.type}">${c.type.toUpperCase()}</span>
      `;

      // HP
      const hpCell = document.createElement("div");
      hpCell.className = "boardCell";
      hpCell.textContent = `${c.curHp}/${c.maxHp}`;

      // Conditions
      const condCell = document.createElement("div");
      condCell.className = "boardConds";
      condCell.innerHTML =
        (c.conditions && c.conditions.length)
          ? c.conditions.map(x => {
              if (typeof x === "string") return `<span class="badge">${escapeHtml(x)}</span>`;
              return `<span class="badge">${escapeHtml(x.name)} (${x.remaining})</span>`;
            }).join(" ")
          : `<span class="badge">—</span>`;

      // Actions (Remove)
      const actions = document.createElement("div");
      actions.className = "boardActionsCell";

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
      row.appendChild(initCell);
      row.appendChild(nameCell);
      row.appendChild(hpCell);
      row.appendChild(condCell);
      row.appendChild(actions);

      encList.appendChild(row);
    });
  }

  // Target dropdown (preserve selection)
  const previous = state.ui.targetId || targetSelect.value || null;
  targetSelect.innerHTML = "";
  enc.roster.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.encId;
    opt.textContent = `${c.name} (${c.type})`;
    targetSelect.appendChild(opt);
  });

  // Restore target if possible
  const valid = enc.roster.some(x => x.encId === previous);
  const fallback = enc.roster.length ? enc.roster[0].encId : "";
  targetSelect.value = valid ? previous : fallback;
  state.ui.targetId = targetSelect.value || null;

  // Saved encounters list
  if (savedEncountersList) {
    savedEncountersList.innerHTML = "";

    if (!state.savedEncounters.length) {
      savedEncountersList.innerHTML = `<div class="hint">No saved encounters yet. Save one from an active roster.</div>`;
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
              encId: uid(),
              baseId: x.baseId || null,
              name: x.name,
              type: x.type,
              maxHp: x.maxHp,
              curHp: x.maxHp,
              init: x.init ?? null,
              avatar: x.avatar || "",
              conditions: [],
              defeated: false
            }));
            state.encounter.turnIndex = 0;
            state.encounter.round = 1;
            state.encounter.status = "ready";

            // Set target to first
            state.ui.targetId = state.encounter.roster[0]?.encId || null;

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

/* ---------- Tabs ---------- */
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tabPanel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    el(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

/* ---------- Event listeners (ONCE) ---------- */
targetSelect?.addEventListener("change", () => {
  state.ui.targetId = targetSelect.value || null;
  saveState();
});

el("encName")?.addEventListener("input", (e) => {
  state.encounter.name = e.target.value;
  saveState();
});

btnOpenVtt?.addEventListener("click", () => {
  window.open("./vtt.html", "ScarlettVTT", "popup=yes,width=1400,height=900");
});

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

  if (editingLibraryId) {
    // SAVE CHANGES
    const existing = state.library.find(x => x.id === editingLibraryId);
    if (!existing) {
      resetAddForm();
      return;
    }

    existing.name = name;
    existing.type = type;
    existing.maxHp = Math.floor(maxHp);
    existing.curHp = Math.min(existing.curHp ?? existing.maxHp, existing.maxHp);
    existing.initBonus = (initBonusRaw === "" || !Number.isFinite(initBonus)) ? null : Math.floor(initBonus);
    existing.avatar = avatar || "";

    // Also update any encounter roster entries that were created from this base combatant
    state.encounter.roster.forEach(r => {
      if (r.baseId === existing.id) {
        const suffixMatch = String(r.name).match(/\s([a-z])$/i);
const suffix = suffixMatch ? ` ${suffixMatch[1]}` : "";
r.name = `${existing.name}${suffix}`;
        r.type = existing.type;
        r.maxHp = existing.maxHp;
        r.avatar = existing.avatar || "";
        r.curHp = Math.min(r.curHp, r.maxHp);
      }
    });

    saveState();
    render();
    resetAddForm();
    return;
  }

  // ADD NEW
  state.library.push({
    id: uid(),
    name,
    type,
    maxHp: Math.floor(maxHp),
    curHp: Math.floor(maxHp),
    initBonus: (initBonusRaw === "" || !Number.isFinite(initBonus)) ? null : Math.floor(initBonus),
    avatar: avatar || ""
  });

  saveState();
  render();
  resetAddForm();
});

if (btnCancelEdit) {
  btnCancelEdit.addEventListener("click", () => resetAddForm());
}

btnAddSelected?.addEventListener("click", () => {
  const ids = Array.from(state.selectedLibraryIds);
  if (ids.length === 0) {
    alert("Select one or more combatants from Storage first.");
    return;
  }

  const enc = state.encounter;

  ids.forEach(id => {
  const base = state.library.find(x => x.id === id);
  if (!base) return;

  const sameCount = enc.roster.filter(r => r.baseId === base.id).length;
  const suffix = sameCount === 0 ? "" : ` ${String.fromCharCode(96 + sameCount)}`;
  const displayName = `${base.name}${suffix}`;

  enc.roster.push({
    encId: uid(),
    baseId: base.id,
    name: displayName,
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
  enc.turnIndex = 0;
  enc.round = 1;

  // Default target = first roster member
  state.ui.targetId = enc.roster[0]?.encId || null;

  saveState();
  render();
});

btnClearEncounter?.addEventListener("click", () => {
  if (!confirm("Clear the encounter roster?")) return;
  state.encounter.roster = [];
  state.encounter.turnIndex = 0;
  state.encounter.round = 1;
  state.encounter.status = "idle";
  state.ui.targetId = null;
  saveState();
  render();
});

btnAutoInit?.addEventListener("click", () => {
  const enc = state.encounter;

  enc.roster.forEach(c => {
    const base = state.library.find(x => x.id === c.baseId);
    const bonus = (base && Number.isFinite(base.initBonus)) ? base.initBonus : 0;
    c.init = d20() + bonus;
  });

  enc.roster.sort((a, b) => (b.init - a.init) || a.name.localeCompare(b.name));
  enc.turnIndex = 0;
  enc.round = 1;
  enc.status = "ready";

  // Keep target valid
  state.ui.targetId = enc.roster[0]?.encId || null;

  saveState();
  render();
});

btnBegin?.addEventListener("click", () => {
  const enc = state.encounter;
  if (!enc.roster.length) return;

  enc.roster.forEach(c => { if (c.init == null) c.init = 0; });
  enc.roster.sort((a, b) => (b.init - a.init) || a.name.localeCompare(b.name));

  enc.status = "running";
  enc.turnIndex = findNextLivingIndex(enc, 0);
  enc.round = 1;

  // Active turn becomes default target unless user picks someone else
  if (!state.ui.targetId) state.ui.targetId = enc.roster[enc.turnIndex]?.encId || null;

  saveState();
  render();
  checkAutoEnd();
});

btnPause?.addEventListener("click", () => {
  state.encounter.status = "paused";
  saveState();
  render();
});

btnEnd?.addEventListener("click", () => {
  state.encounter.status = "ended";
  saveState();
  render();
});

btnAddCondition?.addEventListener("click", () => {
  // Add condition only to selected target (does not advance turn)
  if (state.encounter.status !== "running") return;
  applyDamageAndMaybeCondition({ conditionOnly: true });
  saveState();
  render();
  checkAutoEnd();
});

btnCompleteTurn?.addEventListener("click", () => {
  const enc = state.encounter;
  if (enc.status !== "running") return;

  // 1) Apply to selected target (damage + optional condition)
  applyDamageAndMaybeCondition({ conditionOnly: false });

  // 2) Tick down conditions for combatant whose turn just ended
  const ended = enc.roster[enc.turnIndex];
  tickDownConditionsForCombatant(ended);

  // 3) Move to next living combatant
  const prevIndex = enc.turnIndex;
  enc.turnIndex = findNextLivingIndex(enc, enc.turnIndex + 1);

  // Round increments when we wrap past the end (rough but correct for a simple tracker)
  if (enc.roster.length && enc.turnIndex <= prevIndex) {
    enc.round = (Number.isFinite(enc.round) ? enc.round : 1) + 1;
  }

  // If target was the combatant who just got removed/defeated, keep target valid
  if (!enc.roster.some(x => x.encId === state.ui.targetId)) {
    state.ui.targetId = enc.roster[enc.turnIndex]?.encId || enc.roster[0]?.encId || null;
  }

  saveState();
  render();
  checkAutoEnd();
});

btnSaveEncounter?.addEventListener("click", () => {
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
      init: c.init ?? null,
      avatar: c.avatar || ""
    }))
  };

  state.savedEncounters.push(snapshot);
  saveState();
  render();
  alert(`Saved: ${name}`);
});

/* ---------- Import / Export JSON ---------- */
function exportCampaignJson() {
  return {
    schema: "encounter-tracker-campaign@1",
    exportedAt: new Date().toISOString(),
    library: state.library
  };
}

btnExportJson?.addEventListener("click", () => {
  const data = exportCampaignJson();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `campaign-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

btnImportJson?.addEventListener("click", async () => {
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
      const maxHp = Math.floor(Number(x.maxHp) || 1);
      state.library.push({
        id: uid(),
        name: x.name,
        type: x.type,
        maxHp,
        curHp: maxHp,
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
btnImportPdf?.addEventListener("click", async () => {
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
btnResetAll?.addEventListener("click", () => {
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
btnInstall?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  btnInstall.hidden = true;
});

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
render();
