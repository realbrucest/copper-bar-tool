/* ============================================================
   JSON IMPORT — strict: invalid files are rejected, never fixed
   ============================================================ */
function validateImportedJson(data){
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['Root must be an object.'];
  if (data.imageHeightTiles !== IMG_H_TILES) return [`imageHeightTiles must be ${IMG_H_TILES}.`];
  if (data.imageOffsetTiles !== undefined &&
      (!Number.isInteger(data.imageOffsetTiles) || data.imageOffsetTiles < 0 || data.imageOffsetTiles >= IMG_H_TILES))
    return [`imageOffsetTiles must be an integer from 0 to ${IMG_H_TILES-1}.`];
  if (!Array.isArray(data.bands)) return ['"bands" must be an array.'];
  if (!data.bands.every(b => b && typeof b === 'object' && !Array.isArray(b))) return ['Every band must be an object.'];
  return validateBands(data.bands, data.imageHeightTiles);
}

document.getElementById('jsonInput').addEventListener('change', async (ev)=>{
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const errDiv = document.getElementById('importErr');

  let data;
  try { data = JSON.parse(await file.text()); }
  catch (e){ errDiv.textContent = 'JSON rejected: not valid JSON (' + e.message + ').'; return; }

  const errors = validateImportedJson(data);
  if (errors.length){
    const shown = errors.slice(0,5).join('\n');
    errDiv.textContent = 'JSON rejected:\n' + shown + (errors.length > 5 ? `\n(+${errors.length-5} more)` : '');
    return;
  }
  errDiv.textContent = '';

  state.bands = data.bands.map(b=>({
    id: String(b.id), startTileRow: b.startTileRow, loadMode: b.loadMode, colors: b.colors.slice()
  }));
  state.sourceImage = (typeof data.sourceImage === 'string') ? data.sourceImage : null;
  state.imageOffsetRow = data.imageOffsetTiles ?? 0;
  render();
});