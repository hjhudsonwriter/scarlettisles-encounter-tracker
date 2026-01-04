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

  if (!raw) {
    return {
      library: [],
      selectedLibraryIds: new Set(),
      encounter: {
        name: "",
        status: "idle", // idle | ready | running | paused | ended
        roster: [],
        turnIndex: 0
      }
    };
  }

  const parsed = JSON.parse(raw);

  const ids = Array.isArray(parsed.selectedLibraryIds) ? parsed.selectedLibraryIds : [];
  parsed.selectedLibraryIds = new Set(ids);

  parsed.library = Array.isArray(parsed.library) ? parsed.library : [];
  parsed.encounter = parsed.encounter || { name: "", status: "idle", roster: [], turnIndex: 0 };
  parsed.encounter.roster = Array.isArray(parsed.encou

