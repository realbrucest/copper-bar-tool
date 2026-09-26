/* ============================================================
   PNG IMPORT — only source of real data for the vblank band
   ============================================================ */
document.getElementById('pngInput').addEventListener('change', (ev)=>{
  const file = ev.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = ()=>{
    const off = document.createElement('canvas');
    off.width = img.width; off.height = img.height;
    const octx = off.getContext('2d');
    octx.drawImage(img,0,0);
    const data = octx.getImageData(0,0,img.width,img.height).data;

    const palette = [];
    const key = (r,g,b)=> r+','+g+','+b;
    const seen = new Map();
    const idxBuf = new Uint8Array(img.width*img.height);

    let overflow = false;
    for (let p=0;p<img.width*img.height;p++){
      const r=data[p*4], g=data[p*4+1], b=data[p*4+2];
      const k = key(r,g,b);
      let idx = seen.get(k);
      if (idx === undefined){
        if (palette.length >= 16){ overflow = true; break; }
        idx = palette.length;
        palette.push([r,g,b]);
        seen.set(k, idx);
      }
      idxBuf[p] = idx;
    }

    const errDiv = document.getElementById('importErr');
    if (overflow){
      errDiv.textContent = `PNG rejected: more than 16 unique colors detected. No automatic reduction is performed.`;
      return;
    }
    errDiv.textContent = '';

    const colors16 = new Array(16).fill(0);
    palette.forEach(([r,g,b], i)=>{
      const to3 = v => Math.round(v/255*7);
      colors16[i] = encodeColor(to3(r), to3(g), to3(b));
    });

    indexBuffer = idxBuf;
    imgW = img.width; imgH = img.height;
    state.sourceImage = file.name;

    const vb = state.bands.find(b=>b.loadMode==='vblank');
    vb.colors = colors16;
    render();
  };
  img.src = URL.createObjectURL(file);
});
