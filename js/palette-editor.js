/* ============================================================
   PALETTE EDITOR — side panel.
   Color cells live in the marker rows (markers.js); clicking one
   selects it here. Three 3-bit sliders (0..7) so only the 512
   valid 0x0EEE colors can be set. Live update, no apply button.
   ============================================================ */
let selBand = null, selIdx = null;
const edInfo = document.getElementById('edInfo');
const edSliders = document.getElementById('edSliders');
const sliders = {};

[['r','R','#f55','Red'],['g','G','#5c5','Green'],['b','B','#59f','Blue']].forEach(([k,label,color,name])=>{
  const row = document.createElement('div');
  row.className = 'ch';
  const lab = document.createElement('label');
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = 'range'; input.min = 0; input.max = 7; input.step = 1; input.value = 0;
  input.style.accentColor = color;
  input.title = name + ' (0-7): the Mega Drive has 3 bits per channel, 512 colors in total';
  const out = document.createElement('output');
  out.textContent = '0';

  input.addEventListener('input', ()=>{
    if (!selBand) return;
    const d = decodeColor(selBand.colors[selIdx]);
    const v = { r: d.r3, g: d.g3, b: d.b3 };
    v[k] = +input.value;
    selBand.colors[selIdx] = encodeColor(v.r, v.g, v.b);
    render();
  });

  row.append(lab, input, out);
  edSliders.appendChild(row);
  sliders[k] = { input, out };
});

function selectColor(band, idx){
  selBand = band; selIdx = idx;
  selBands.clear();                 // the color cell is now the active target
  render();
}

function hex4(word){
  return '0x' + word.toString(16).toUpperCase().padStart(4,'0');
}

// Called from render(): keeps the panel in sync with state (edits, imports, deletes).
function refreshEditor(){
  if (selBand && !state.bands.includes(selBand)) selBand = null;
  edSliders.style.display = selBand ? '' : 'none';
  if (!selBand){ edInfo.textContent = 'Select a color'; return; }

  const c = selBand.colors[selIdx];
  const d = decodeColor(c);
  const vals = { r: d.r3, g: d.g3, b: d.b3 };
  for (const k in sliders){
    sliders[k].input.value = vals[k];
    sliders[k].out.textContent = vals[k];
  }
  const where = selBand.loadMode === 'vblank' ? 'vblank' : `row ${selBand.startTileRow}`;
  edInfo.textContent = `${where} · #${selIdx} · ${hex4(c)}`;
}