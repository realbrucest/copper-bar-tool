/* ============================================================
   HISTORY (undo/redo) + AUTOSAVE + NEW
   Snapshot-based: every change to the design is detected in render()
   (see historyCheck) by comparing against the current history entry.
   A snapshot = bands + image position + source name + a REFERENCE to the
   imported index buffer (never mutated, so it is shared, not copied).
   Selection is not part of the history.

   Coalescing: changes made while the mouse button is held (drags, sliders)
   or within COALESCE_MS of each other (keyboard) share one history entry;
   a new mouse press starts a new one.

   Autosave: the session is written to localStorage (debounced) and restored
   on load. The undo history itself is not persisted.
   ============================================================ */
const HIST_MAX = 200;
const COALESCE_MS = 700;
const SESSION_KEY = 'copperbar-tool.session.v1';
const IMAGE_KEY = 'copperbar-tool.image.v1';

const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');
const btnNew = document.getElementById('btnNew');
const saveInfo = document.getElementById('saveInfo');

let hist = [], histPos = -1;
let boundary = true;        // next change must start a new history entry
let mouseIsDown = false;
let lastChangeAt = 0;

function snapshot(){
  return {
    data: JSON.stringify({ bands: state.bands, off: imgOffset(), src: state.sourceImage }),
    buf: indexBuffer, w: imgW, h: imgH
  };
}
function sameSnapshot(a, b){
  return a.data === b.data && a.buf === b.buf && a.w === b.w && a.h === b.h;
}

// Called at the end of every render(): records design changes.
function historyCheck(){
  if (!hist.length) return;
  const cur = snapshot();
  if (!sameSnapshot(cur, hist[histPos])){
    const now = Date.now();
    const burst = !boundary && histPos === hist.length - 1 && histPos > 0 &&
                  (mouseIsDown || now - lastChangeAt < COALESCE_MS);
    if (burst){
      hist[histPos] = cur;
    } else {
      hist.length = histPos + 1;          // drop the redo branch
      hist.push(cur);
      if (hist.length > HIST_MAX) hist.shift();
      histPos = hist.length - 1;
    }
    boundary = false;
    lastChangeAt = now;
  }
  updateHistoryButtons();
}

function updateHistoryButtons(){
  btnUndo.disabled = histPos <= 0;
  btnRedo.disabled = histPos >= hist.length - 1;
}

function applySnapshot(s){
  const keep = selBand ? { id: selBand.id } : null;   // keep the color selection by band id
  const d = JSON.parse(s.data);
  state.bands = d.bands;
  state.imageOffsetRow = d.off;
  state.sourceImage = d.src;
  indexBuffer = s.buf; imgW = s.w; imgH = s.h;
  if (keep) selBand = state.bands.find(b => b.id === keep.id) || null;
  boundary = true;
  render();
}

function undo(){ if (histPos > 0){ histPos--; applySnapshot(hist[histPos]); } }
function redo(){ if (histPos < hist.length - 1){ histPos++; applySnapshot(hist[histPos]); } }

btnUndo.onclick = undo;
btnRedo.onclick = redo;

document.addEventListener('mousedown', ()=>{ mouseIsDown = true; boundary = true; }, true);
document.addEventListener('mouseup', ()=>{ mouseIsDown = false; }, true);
window.addEventListener('blur', ()=>{ mouseIsDown = false; });

document.addEventListener('keydown', (ev)=>{
  if (!(ev.ctrlKey || ev.metaKey)) return;
  const k = ev.key.toLowerCase();
  if (k === 'z' && !ev.shiftKey){ ev.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && ev.shiftKey)){ ev.preventDefault(); redo(); }
});

/* ---------------- New ---------------- */
btnNew.onclick = ()=>{
  const hasWork = indexBuffer || state.bands.length > 1 || state.bands[0].colors.some(c => c !== 0);
  if (hasWork && !confirm('Start a new design? Ctrl+Z can undo this until the page is reloaded.')) return;
  state.bands = [{ id: 'vblank', startTileRow: 0, loadMode: 'vblank', colors: new Array(16).fill(0) }];
  state.sourceImage = null;
  state.imageOffsetRow = 0;
  indexBuffer = null; imgW = 32; imgH = TOTAL_SCANLINES;
  selBand = null; selBands.clear();
  document.getElementById('importErr').textContent = '';
  boundary = true;
  render();
};

/* ---------------- Autosave / restore ---------------- */
let saveTimer = null, savedData = null, savedBuf;   // savedBuf undefined = nothing written yet

function toB64(u8){
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64){
  const s = atob(b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

function scheduleAutosave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosave, 400);
}

function autosave(){
  const snap = snapshot();
  if (snap.data === savedData && snap.buf === savedBuf) return;
  try {
    localStorage.setItem(SESSION_KEY, snap.data);
    savedData = snap.data;
  } catch (e){
    saveInfo.textContent = 'autosave unavailable';
    return;
  }
  let note = '';
  if (snap.buf !== savedBuf){
    try {
      if (snap.buf) localStorage.setItem(IMAGE_KEY, JSON.stringify({ w: imgW, h: imgH, b64: toB64(snap.buf) }));
      else localStorage.removeItem(IMAGE_KEY);
      savedBuf = snap.buf;
    } catch (e){
      note = ' (image too large to store)';
    }
  }
  saveInfo.textContent = 'autosaved ' + new Date().toLocaleTimeString() + note;
}

// Lenient check: a session may legitimately have no hint bands yet.
function sessionBandsOk(bands){
  if (!Array.isArray(bands) || bands.filter(b => b.loadMode === 'vblank').length !== 1) return false;
  return bands.every(b =>
    typeof b.id === 'string' && (b.loadMode === 'vblank' || b.loadMode === 'hint') &&
    Number.isInteger(b.startTileRow) && b.startTileRow >= 0 && b.startTileRow < IMG_H_TILES &&
    (b.loadMode === 'vblank') === (b.startTileRow === 0) &&
    Array.isArray(b.colors) && b.colors.length === 16 &&
    b.colors.every(c => Number.isInteger(c) && c >= 0 && c <= 0x0EEE && isValidColor(c)));
}

function restoreSession(){
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || !sessionBandsOk(d.bands)) return;
    state.bands = d.bands;
    state.imageOffsetRow = Number.isInteger(d.off) ? d.off : 0;
    state.sourceImage = typeof d.src === 'string' ? d.src : null;

    const im = localStorage.getItem(IMAGE_KEY);
    if (im){
      const o = JSON.parse(im), u = fromB64(o.b64);
      if (Number.isInteger(o.w) && Number.isInteger(o.h) && o.w > 0 && o.h > 0 && u.length === o.w * o.h){
        indexBuffer = u; imgW = o.w; imgH = o.h;
      }
    }
  } catch (e){
    console.warn('Session restore failed, starting empty:', e);
  }
}

restoreSession();
hist = [snapshot()];
histPos = 0;
updateHistoryButtons();