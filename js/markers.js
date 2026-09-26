/* ============================================================
   MARKERS — one row per band to the right of the canvas:
   [triangle handle] [16 color cells] [x]
   The row is one tile-row tall and starts at the band's first line.
   Multi-select: Shift/Ctrl+click on triangles, Ctrl+A, Esc to clear.
   Dragging any selected triangle moves the whole selection as a block.
   ============================================================ */
const markersLayer = document.getElementById('markers');
const canvasWrap = document.getElementById('canvasWrap');
const selBands = new Set();   // ids of the selected hint bands

// Tile-row ruler (left of the image); rows where a band starts are highlighted.
// Rows >= NTSC_TILES (28, 29) are past the 224-line NTSC screen - the extra
// scanlines are always available to place bands/image in, this just marks
// them as PAL-only so it's clear why they look "unused" on an NTSC display.
const ruler = document.getElementById('ruler');
for (let r = 0; r < IMG_H_TILES; r++){
  const d = document.createElement('div');
  d.textContent = r;
  if (r >= NTSC_TILES){
    d.classList.add('pal-only');
    d.title = 'Row ' + r + ': beyond the 224-line NTSC screen (PAL only)';
  }
  ruler.appendChild(d);
}

function renderMarkers(){
  for (const id of [...selBands]){
    if (!state.bands.some(b=>b.id===id)) selBands.delete(id);   // band was deleted / replaced
  }
  Array.from(ruler.children).forEach((d,r)=>{
    d.classList.toggle('band', state.bands.some(b=>b.startTileRow === r));
  });

  markersLayer.innerHTML = '';
  const h = canvasWrap.clientHeight;
  for (const b of state.bands){
    const isHint = b.loadMode === 'hint';
    const row = document.createElement('div');
    row.className = 'mrow' + (isHint ? '' : ' vblank') + (selBands.has(b.id) ? ' sel' : '') +
                    (warnBands.has(b.id) ? ' warn' : '');
    row.style.top = (b.startTileRow*TILE_H/TOTAL_SCANLINES*h) + 'px';

    const tri = document.createElement('div');
    tri.className = 'marker';
    tri.title = (isHint
      ? 'Drag to move (snaps to tile-rows). Shift/Ctrl+click: add to the selection, then drag to move them together. Right-click: copy/paste palette, delete.'
      : 'Vblank band: loaded before the frame starts, fixed at the top.') +
      (warnBands.has(b.id) ? '\n\u26a0 ' + warnBands.get(b.id) : '');
    row.appendChild(tri);

    const strip = document.createElement('div');
    strip.className = 'strip';
    b.colors.forEach((c,i)=>{
      const sw = document.createElement('div');
      sw.className = 'sw' + (b === selBand && i === selIdx ? ' selected' : '');
      sw.style.background = colorToCss(c);
      sw.title = `#${i}  ${hex4(c)} - click to edit`;
      sw.onclick = ()=>selectColor(b, i);
      strip.appendChild(sw);
    });
    row.appendChild(strip);

    // Right-click anywhere on a band row (cells, vblank triangle): palette copy/paste.
    // The hint triangle has its own menu below and stops the event first.
    row.addEventListener('contextmenu', (ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      showCtxMenu(ev.clientX, ev.clientY, paletteMenuItems(b));
    });

    if (isHint){
      const del = document.createElement('div');
      del.className = 'del';
      del.textContent = '\u00d7';
      del.title = 'Delete band';
      del.onclick = ()=>deleteBand(b);
      row.appendChild(del);
      attachMarkerHandlers(tri, b);
    }
    markersLayer.appendChild(row);
  }
}

function deleteBand(band){
  state.bands = state.bands.filter(x=>x.id!==band.id);
  render();
}

// Allowed row delta for moving `moving` bands rigidly: they must stay inside
// rows 1..last and keep MIN_BAND_SPACING_ROWS from every non-selected band
// (which also means the block can never cross one).
function blockDeltaRange(moving){
  let lo = -Infinity, hi = Infinity;
  const last = state.imageHeightTiles - 1;
  for (const s of moving){
    lo = Math.max(lo, 1 - s.startTileRow);
    hi = Math.min(hi, last - s.startTileRow);
    for (const o of state.bands){
      if (o.loadMode !== 'hint' || moving.includes(o)) continue;
      if (o.startTileRow < s.startTileRow) lo = Math.max(lo, o.startTileRow + MIN_BAND_SPACING_ROWS - s.startTileRow);
      else hi = Math.min(hi, o.startTileRow - MIN_BAND_SPACING_ROWS - s.startTileRow);
    }
  }
  return [lo, hi];
}

function attachMarkerHandlers(tri, band){
  tri.addEventListener('mousedown', (ev)=>{
    ev.preventDefault();
    if (ev.shiftKey || ev.ctrlKey || ev.metaKey){        // toggle in the selection, no drag
      if (selBands.has(band.id)) selBands.delete(band.id); else selBands.add(band.id);
      render();
      return;
    }
    const wasSelected = selBands.has(band.id);
    if (!wasSelected){ selBands.clear(); selBands.add(band.id); render(); }

    const moving = state.bands.filter(b=>b.loadMode==='hint' && selBands.has(b.id));
    const orig = moving.map(b=>b.startTileRow);
    const [dMin, dMax] = blockDeltaRange(moving);
    const startY = ev.clientY;
    const rowPx = canvasWrap.clientHeight / state.imageHeightTiles;
    let moved = false, lastD = 0;

    function onMove(e){
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      const d = Math.max(dMin, Math.min(dMax, Math.round(dy / rowPx)));
      if (d !== lastD){
        lastD = d;
        moving.forEach((b,i)=>{ b.startTileRow = orig[i] + d; });
        render();
      }
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved && wasSelected && selBands.size > 1){    // plain click inside a group: keep only this one
        selBands.clear(); selBands.add(band.id);
        render();
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  tri.addEventListener('contextmenu', (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();
    const group = selBands.has(band.id) && selBands.size > 1;
    showCtxMenu(ev.clientX, ev.clientY, [
      ...paletteMenuItems(band),
      group
        ? { label: `Delete ${selBands.size} selected bands`,
            action: ()=>{ state.bands = state.bands.filter(b=>!selBands.has(b.id)); selBands.clear(); render(); } }
        : { label: 'Delete band', action: ()=>deleteBand(band) }
    ]);
  });
}

document.addEventListener('keydown', (ev)=>{
  if (ev.target.tagName === 'INPUT') return;
  if (ev.key === 'Escape'){
    selBands.clear();
    render();
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a'){
    ev.preventDefault();
    state.bands.filter(b=>b.loadMode==='hint').forEach(b=>selBands.add(b.id));
    render();
  }
});