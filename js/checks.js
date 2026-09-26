/* ============================================================
   LIVE CHECKS + transient notices
   Runs on every render(). Shows a warning pill in the toolbar (tooltip
   lists the issues) and marks the affected band triangles in amber.
   The tool already prevents invalid positions, so most warnings are about
   reloads that are useless (wasted CPU in the H-INT) rather than invalid.
   ============================================================ */
const warnBands = new Map();          // band id -> message
const warnPill = document.getElementById('warnPill');
const noticeEl = document.getElementById('notice');
let maskCache = { buf: null, w: 0, h: 0, rows: null };
let noticeTimer = null;

function flash(text){
  noticeEl.textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(()=>{ noticeEl.textContent = ''; }, 2500);
}

// Per image row: bitmask of the palette indices used (cached per imported image).
function rowMasks(){
  if (!indexBuffer) return null;
  if (maskCache.buf !== indexBuffer || maskCache.w !== imgW || maskCache.h !== imgH){
    const rows = new Uint16Array(imgH);
    for (let y = 0; y < imgH; y++){
      let m = 0;
      for (let x = 0; x < imgW; x++) m |= 1 << indexBuffer[y*imgW + x];
      rows[y] = m;
    }
    maskCache = { buf: indexBuffer, w: imgW, h: imgH, rows };
  }
  return maskCache.rows;
}

// Palette indices that are visible on screen lines [y0, y1): image pixels inside
// the image, the backdrop (index 0) outside it.
function usedMask(y0, y1, masks, top){
  let m = 0;
  for (let y = y0; y < y1; y++){
    const sy = y - top;
    m |= (sy >= 0 && sy < imgH) ? masks[sy] : 1;
  }
  return m;
}

function updateWarnings(){
  warnBands.clear();
  // "no hint band yet" is the normal starting point, not worth a permanent warning
  const list = validateState().filter(e => !/At least one hint band/.test(e));

  const bands = sortedBands();
  const masks = rowMasks();
  const top = imgOffset() * TILE_H;

  const ntscEnd = NTSC_TILES * TILE_H;   // NTSC is the common target: rows past this are always
                                          // off-screen there, so they don't count as "unused by mistake"
  for (let i = 1; i < bands.length; i++){
    const b = bands[i], prev = bands[i-1];
    const y0 = b.startTileRow * TILE_H;
    const y1raw = (i + 1 < bands.length) ? bands[i+1].startTileRow * TILE_H : TOTAL_SCANLINES;
    const y1 = Math.min(y1raw, ntscEnd);           // clip the "unused" check to the NTSC-visible range
    const changed = b.colors.map((c,k) => c !== prev.colors[k]);

    let msg = null;
    if (!changed.some(Boolean)){
      msg = 'Identical to the previous band: this reload changes nothing.';
    } else if (masks && y0 < y1){
      const used = usedMask(y0, y1, masks, top);
      if (!changed.some((ch,k) => ch && ((used >> k) & 1)))
        msg = `Changes nothing visible in the preview (rows ${y0/TILE_H}-${y1/TILE_H - 1}).`;
    }
    if (msg){
      warnBands.set(b.id, msg);
      list.push(`Band at row ${b.startTileRow}: ${msg}`);
    }
  }

  warnPill.style.display = list.length ? '' : 'none';
  warnPill.textContent = '\u26a0 ' + list.length;
  warnPill.title = list.join('\n');
}