/* ============================================================
   CONSTANTS + COLOR ENCODING
   Mega Drive VDP CRAM color helpers (0x0BGR words, 0x0EEE mask).
   ============================================================ */
const TILE_H = 8;
const NTSC_TILES = 28;             // 224 visible scanlines on NTSC (rows 0..27)
const IMG_H_TILES = 30;            // 240 scanlines always available (PAL); rows 28-29
                                   // are outside the NTSC-safe area, marked in the ruler
const TOTAL_SCANLINES = IMG_H_TILES * TILE_H;

/* Copper timing model (matches the H-INT handlers in test_asm_copper_tool.s).
   Band i is "visible" from scanline s = startTileRow*8: color pair k is
   visible from line s+k. */
const MIN_BAND_SPACING_ROWS = 2;   // min distance between hint bands, in tile-rows
                                   // (the idle gap after a band must be >= 2 lines)
const HINT_SETUP_LATENCY = 2;      // lines between the idle "setup" H-INT and the first
                                   // visible pair. CALIBRATE on emulator/hardware.
const BAND_STRIDE_OVERHEAD = 9;    // 8 active H-INTs + 1 setup H-INT between two bands:
                                   // gap_after (DBRA value) = start_next - start - 9
const LAST_BAND_GAP = 0x7FFF;      // gap after the last band: never expires in a frame

// Internal format: array of 16 valid 0x0BGR words (0x0EEE mask).
function encodeColor(r3,g3,b3){ // r3,g3,b3 in 0..7
  return ((b3&7)<<9) | ((g3&7)<<5) | ((r3&7)<<1);
}
function decodeColor(word){
  return { r3:(word>>1)&7, g3:(word>>5)&7, b3:(word>>9)&7 };
}
function colorToCss(word){
  const {r3,g3,b3} = decodeColor(word);
  const s = v => Math.round(v*255/7);
  return `rgb(${s(r3)},${s(g3)},${s(b3)})`;
}
function isValidColor(word){
  return (word & ~0x0EEE) === 0;
}