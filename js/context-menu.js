/* ============================================================
   CONTEXT MENU — right-click on the image adds a band at that row
   ============================================================ */
const ctxMenu = document.getElementById('ctxMenu');

function showCtxMenu(x, y, items){
  ctxMenu.innerHTML = '';
  items.forEach(it=>{
    const d = document.createElement('div');
    d.textContent = it.label;
    d.onclick = ()=>{ hideCtxMenu(); it.action(); };
    ctxMenu.appendChild(d);
  });
  ctxMenu.style.left = x+'px';
  ctxMenu.style.top = y+'px';
  ctxMenu.style.display = 'block';
}
function hideCtxMenu(){ ctxMenu.style.display = 'none'; }
document.addEventListener('click', hideCtxMenu);

canvasWrap.addEventListener('contextmenu', (ev)=>{
  // Only fires when not over a marker (markers stop propagation themselves).
  ev.preventDefault();
  const rect = canvasWrap.getBoundingClientRect();
  const relY = ev.clientY - rect.top;
  const scanline = relY / rect.height * TOTAL_SCANLINES;
  let tileRow = Math.round(scanline / TILE_H);
  tileRow = Math.max(1, Math.min(state.imageHeightTiles-1, tileRow));

  showCtxMenu(ev.clientX, ev.clientY, [
    { label: `Add hint band at tile-row ${tileRow}`, action: ()=> addBandAt(tileRow) }
  ]);
});

function addBandAt(tileRow){
  const tooClose = state.bands.find(b => b.loadMode==='hint' &&
    Math.abs(b.startTileRow - tileRow) < MIN_BAND_SPACING_ROWS);
  if (tooClose){
    alert(`Bands must be at least ${MIN_BAND_SPACING_ROWS} tile-rows apart (nearest: row ${tooClose.startTileRow}).`);
    return;
  }
  // Clone the palette of the band currently active just above this
  // row, so a new marker starts as a visual no-op instead of black.
  const above = sortedBands()
    .filter(b => b.startTileRow < tileRow)
    .pop();
  const clonedColors = above ? above.colors.slice() : new Array(16).fill(0);

  state.bands.push({ id:'band_'+Date.now(), startTileRow: tileRow, loadMode:'hint', colors: clonedColors });
  render();
}

// Double-click on the image: add a hint band at that row (shortcut for the
// context-menu entry above). Attached to the canvas itself, not canvasWrap,
// so it never fires from the marker strips/editor sitting to its right.
canvas.addEventListener('dblclick', (ev)=>{
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const relY = ev.clientY - rect.top;
  const scanline = relY / rect.height * TOTAL_SCANLINES;
  let tileRow = Math.round(scanline / TILE_H);
  tileRow = Math.max(1, Math.min(state.imageHeightTiles-1, tileRow));
  addBandAt(tileRow);
});