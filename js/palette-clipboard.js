/* ============================================================
   PALETTE CLIPBOARD — copy / paste a band's 16 colors
   Copy:  right-click a band (triangle or color cells) -> Copy palette,
          or Ctrl+C. Source = the single selected marker, else the band of
          the selected color cell.
   Paste: right-click -> Paste palette, or Ctrl+V. Target = the selected
          markers (all of them), else the band of the selected color cell.
   ============================================================ */
let palClip = null;   // array of 16 colors, or null

function bandLabel(b){ return b.loadMode === 'vblank' ? 'vblank' : 'row ' + b.startTileRow; }

function hintSelected(){
  return state.bands.filter(b => b.loadMode === 'hint' && selBands.has(b.id));
}

function activeSourceBand(){
  const sel = hintSelected();
  if (sel.length === 1) return sel[0];
  return (selBand && state.bands.includes(selBand)) ? selBand : null;
}

function pasteTargets(){
  const sel = hintSelected();
  if (sel.length) return sel;
  return (selBand && state.bands.includes(selBand)) ? [selBand] : [];
}

function copyPalette(band){
  palClip = band.colors.slice();
  flash(`Palette copied (${bandLabel(band)})`);
}

function pastePalette(targets){
  if (!palClip){ flash('Nothing to paste: copy a palette first'); return; }
  if (!targets.length) return;
  targets.forEach(b => { b.colors = palClip.slice(); });
  boundary = true;                        // one history step, never merged with a previous edit
  render();
  flash(targets.length === 1
    ? `Palette pasted (${bandLabel(targets[0])})`
    : `Palette pasted into ${targets.length} bands`);
}

// Context-menu entries shared by triangles and color cells.
function paletteMenuItems(band){
  const items = [{ label: 'Copy palette', action: () => copyPalette(band) }];
  if (palClip){
    const group = band.loadMode === 'hint' && selBands.has(band.id) && selBands.size > 1;
    items.push(group
      ? { label: `Paste palette into ${selBands.size} selected bands`, action: () => pastePalette(hintSelected()) }
      : { label: 'Paste palette', action: () => pastePalette([band]) });
  }
  return items;
}

document.addEventListener('keydown', (ev)=>{
  if (!(ev.ctrlKey || ev.metaKey)) return;
  if (ev.target.tagName === 'INPUT' && ev.target.type !== 'range') return;
  const k = ev.key.toLowerCase();
  if (k === 'c'){
    const b = activeSourceBand();
    if (b){ ev.preventDefault(); copyPalette(b); }
  } else if (k === 'v'){
    const t = pasteTargets();
    if (t.length){ ev.preventDefault(); pastePalette(t); }
  }
});