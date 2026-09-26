/* ============================================================
   RENDER — image + stats + image vertical position
   The image can be placed anywhere vertically (in tile-rows), because the
   game may have e.g. a HUD above it. Outside the image the backdrop
   (palette index 0) is shown. The offset is a preview/design aid only:
   bands always use absolute screen tile-rows.
   ============================================================ */
const canvas = document.getElementById('main');
const ctx = canvas.getContext('2d');
const hoverInfo = document.getElementById('hoverInfo');

// Magnifier: shows an enlarged, pixel-exact patch of the main canvas around
// the cursor, with a crosshair on the exact pixel a click would pick. Reads
// straight from the already-rendered canvas, so it always matches what's on
// screen (palette-at-scanline, backdrop, image offset) with no recomputation.
const magnifier = document.getElementById('magnifier');
const magCanvas = document.getElementById('magCanvas');
const magCtx = magCanvas.getContext('2d');
const magInfo = document.getElementById('magInfo');
const MAG_PATCH = 16;                         // source pixels captured, centered on the cursor
const MAG_ZOOM = magCanvas.width / MAG_PATCH; // 128/16 = 8x
magCtx.imageSmoothingEnabled = false;
const magPatchCanvas = document.createElement('canvas');
magPatchCanvas.width = MAG_PATCH; magPatchCanvas.height = MAG_PATCH;
const magPatchCtx = magPatchCanvas.getContext('2d');

function updateMagnifier(cx, cy){
  const half = MAG_PATCH >> 1;
  const sx = Math.max(0, Math.min(canvas.width  - MAG_PATCH, cx - half));
  const sy = Math.max(0, Math.min(canvas.height - MAG_PATCH, cy - half));
  magPatchCtx.putImageData(ctx.getImageData(sx, sy, MAG_PATCH, MAG_PATCH), 0, 0);
  magCtx.clearRect(0, 0, magCanvas.width, magCanvas.height);
  magCtx.drawImage(magPatchCanvas, 0, 0, MAG_PATCH, MAG_PATCH, 0, 0, magCanvas.width, magCanvas.height);

  // crosshair over the exact pixel under the cursor
  const lx = (cx - sx) * MAG_ZOOM, ly = (cy - sy) * MAG_ZOOM;
  magCtx.strokeStyle = '#000a'; magCtx.lineWidth = 1;
  magCtx.strokeRect(lx - 0.5, ly - 0.5, MAG_ZOOM + 1, MAG_ZOOM + 1);
  magCtx.strokeStyle = '#fff'; magCtx.lineWidth = 1;
  magCtx.strokeRect(lx + 0.5, ly + 0.5, MAG_ZOOM - 1, MAG_ZOOM - 1);
}
const uniqueColorsEl = document.getElementById('uniqueColors');
const imgUpBtn = document.getElementById('imgUp');
const imgDownBtn = document.getElementById('imgDown');
const imgRowEl = document.getElementById('imgRow');

// Distinct 0x0BGR values across every band (vblank included).
function countUniqueColors(){
  const set = new Set();
  for (const b of state.bands) for (const c of b.colors) set.add(c);
  return set.size;
}

function updateStats(){
  uniqueColorsEl.textContent = countUniqueColors();
}

function imgOffset(){ return state.imageOffsetRow | 0; }   // tile-rows from the top

// Allowed offsets: the image must stay fully inside the 224 visible lines.
function imageOffsetRange(){
  const tiles = indexBuffer ? Math.ceil(imgH / TILE_H) : 1;
  return [0, Math.max(0, state.imageHeightTiles - tiles)];
}

function updateImageControls(){
  const [lo, hi] = imageOffsetRange();
  const off = imgOffset();
  const movable = !!indexBuffer && hi > lo;
  imgRowEl.textContent = off;
  imgUpBtn.disabled = !movable || off <= lo;
  imgDownBtn.disabled = !movable || off >= hi;
}

function moveImage(deltaRows){
  const [lo, hi] = imageOffsetRange();
  state.imageOffsetRow = Math.max(lo, Math.min(hi, imgOffset() + deltaRows));
  render();
}
imgUpBtn.onclick = ()=>moveImage(-1);
imgDownBtn.onclick = ()=>moveImage(1);

function render(){
  if (indexBuffer){                       // keep the offset valid after importing another PNG
    const [lo, hi] = imageOffsetRange();
    state.imageOffsetRow = Math.max(lo, Math.min(hi, imgOffset()));
  }
  const top = imgOffset() * TILE_H;

  const w = canvas.width, h = canvas.height;
  const imageData = ctx.createImageData(w, h);

  for (let y=0; y<TOTAL_SCANLINES; y++){
    const pal = paletteAtScanline(y);
    const sy = y - top;
    const inImage = indexBuffer && sy >= 0 && sy < imgH;
    for (let x=0; x<w; x++){
      let idx = 0;                        // backdrop outside the image
      if (inImage){
        const sx = Math.floor(x * imgW / w);
        idx = indexBuffer[sy*imgW+sx];
      }
      const {r3,g3,b3} = decodeColor(pal[idx] ?? 0);
      const s = v => Math.round(v*255/7);
      const off = (y*w+x)*4;
      imageData.data[off]   = s(r3);
      imageData.data[off+1] = s(g3);
      imageData.data[off+2] = s(b3);
      imageData.data[off+3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  updateWarnings();
  renderMarkers();
  updateStats();
  refreshEditor();
  updateImageControls();
  historyCheck();
  scheduleAutosave();
}

// Drag on the image = move it vertically (snaps to tile-rows).
let imageDragged = false;
canvas.addEventListener('mousedown', (ev)=>{
  const [lo, hi] = imageOffsetRange();
  if (ev.button !== 0 || !indexBuffer || hi <= lo) return;
  const startX = ev.clientX, startY = ev.clientY, startOff = imgOffset();
  const rowPx = canvas.getBoundingClientRect().height / state.imageHeightTiles;
  let moved = false;

  function onMove(e){
    const dx = e.clientX - startX, dy = e.clientY - startY;
    // Only a clearly vertical gesture starts the drag: a mostly-horizontal
    // movement (or plain jitter) never moves the image, even if it briefly
    // passes the 3px threshold.
    if (!moved && Math.abs(dy) > 3 && Math.abs(dy) > Math.abs(dx)){
      moved = true;
      document.body.style.cursor = 'ns-resize';   // only while actually dragging the image
    }
    if (!moved) return;
    const off = Math.max(lo, Math.min(hi, startOff + Math.round(dy / rowPx)));
    if (off !== imgOffset()){ state.imageOffsetRow = off; render(); }
  }
  function onUp(){
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    if (moved){
      imageDragged = true;                       // swallow the click that follows the drag
      setTimeout(()=>{ imageDragged = false; }, 0);
    }
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
});

// Hover: tile-row + palette index/color readout, and the magnifier patch.
canvas.addEventListener('mousemove', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / rect.width * canvas.width);
  const y = Math.floor((ev.clientY - rect.top) / rect.height * canvas.height);
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height){
    hoverInfo.textContent = ''; magnifier.classList.remove('active'); return;
  }

  const row = Math.floor(y / TILE_H);
  const sy = y - imgOffset() * TILE_H;
  if (!indexBuffer || sy < 0 || sy >= imgH){
    hoverInfo.textContent = `row ${row} \u00b7 backdrop (#0)`;
    magInfo.textContent = `row ${row} \u00b7 backdrop`;
  } else {
    const sx = Math.floor(x * imgW / canvas.width);
    const idx = indexBuffer[sy*imgW+sx];
    const label = `row ${row} \u00b7 #${idx}  ${hex4(paletteAtScanline(y)[idx] ?? 0)}`;
    hoverInfo.textContent = label;
    magInfo.textContent = label;
  }
  magnifier.classList.add('active');
  updateMagnifier(x, y);
});
canvas.addEventListener('mouseleave', ()=>{
  hoverInfo.textContent = '';
  magnifier.classList.remove('active');
});

// Click on a pixel = edit the palette color it uses.
canvas.addEventListener('click', (ev)=>{
  if (imageDragged){ imageDragged = false; return; }
  if (!indexBuffer) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / rect.width * canvas.width);
  const y = Math.floor((ev.clientY - rect.top) / rect.height * canvas.height);
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

  const sy = y - imgOffset() * TILE_H;
  if (sy < 0 || sy >= imgH) return;              // outside the image
  const sx = Math.floor(x * imgW / canvas.width);
  const idx = indexBuffer[sy*imgW+sx];

  selBands.clear();                               // clicking the image clears the marker selection
  const band = bandOwningColorAt(y, idx);
  selectColor(band, idx);
});