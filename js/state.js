/* ============================================================
   STATE
   ============================================================ */

// Initial state: only the mandatory vblank band, black, no example
// hint bands. Nothing is generated until the user imports a PNG
// and/or adds bands.
let state = {
  imageHeightTiles: IMG_H_TILES,
  sourceImage: null,
  bands: [
    { id: "vblank", startTileRow: 0, loadMode: "vblank", colors: new Array(16).fill(0) }
  ]
};

let indexBuffer = null; // imported PNG index buffer (0..15 per pixel), or null
let imgW = 32, imgH = TOTAL_SCANLINES;

function sortedBands(){
  return [...state.bands].sort((a,b)=>a.startTileRow-b.startTileRow);
}

// Effective palette for a given scanline, simulating progressive
// CRAM rewrite (2 entries per active line).
function paletteAtScanline(y){
  const bands = sortedBands();
  let curIdx = 0;
  for (let i=0;i<bands.length;i++){
    if (bands[i].startTileRow*TILE_H <= y) curIdx = i; else break;
  }
  const cur = bands[curIdx];
  if (cur.loadMode === "vblank") return cur.colors.slice();

  const transitionStart = cur.startTileRow*TILE_H;
  const offset = y - transitionStart;
  if (offset >= 8) return cur.colors.slice();

  const prev = bands[curIdx-1];
  const out = new Array(16);
  const writtenCount = 2*(offset+1);
  for (let i=0;i<16;i++){
    out[i] = (i < writtenCount) ? cur.colors[i] : prev.colors[i];
  }
  return out;
}

function bandOwningColorAt(y, idx){
  const bands = sortedBands();
  let curIdx = 0;
  for (let i=0;i<bands.length;i++){
    if (bands[i].startTileRow*TILE_H <= y) curIdx = i; else break;
  }
  const cur = bands[curIdx];
  if (cur.loadMode === "vblank") return cur;

  const transitionStart = cur.startTileRow*TILE_H;
  const offset = y - transitionStart;
  if (offset >= 8) return cur;

  const prevBand = bands[curIdx-1];
  const writtenCount = 2*(offset+1);
  return (idx < writtenCount) ? cur : prevBand;
}
