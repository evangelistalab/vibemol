(function (global) {
  'use strict';
  const defaults = Object.freeze({ cols: 3, gutter: 24, border: false, camera: 'current', sharedIso: false,
    sharedLook: true, widthIn: 6.5, dpi: 300, background: 'look', format: 'png', labelPosition: 'below', fontPt: 10 });
  const MAX_PIXELS = 64000000, MAX_DIMENSION = 32767, MAX_PANELS = 128;
  const escapeXml = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]));
  const stem = name => String(name || 'figure').replace(/\.[^/.]+$/, '');
  function layout(count, input = {}, limit = 8192) {
    const o = { ...defaults, ...input };
    function number(key, min, max, integer = false) {
      const n = Number(o[key]);
      if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`Invalid ${key}: use ${min}–${max}${integer ? ' whole numbers' : ''}.`);
      o[key] = n;
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_PANELS) throw new Error(`Choose 1–${MAX_PANELS} panels.`);
    number('cols', 1, 12, true); number('gutter', 0, 1000, true); number('widthIn', .1, 40); number('dpi', 36, 2400); number('fontPt', 4, 48);
    for (const [key, allowed] of Object.entries({ camera:['current','fit'], background:['transparent','look','white'], format:['png','svg'], labelPosition:['below','overlay'] })) {
      if (!allowed.includes(o[key])) throw new Error(`Unknown ${key}.`);
    }
    const width = input.width == null ? Math.round(o.widthIn * o.dpi) : Math.round(Number(input.width));
    if (!Number.isFinite(width) || width < 16 || width > MAX_DIMENSION) throw new Error(`Figure width must be 16–${MAX_DIMENSION} pixels.`);
    o.widthIn = width / o.dpi;
    const cols = Math.min(count, o.cols), rows = Math.ceil(count / cols);
    const panel = Math.floor((width - (cols - 1) * o.gutter) / cols);
    if (panel < 16) throw new Error('The gutter leaves too little room for the panels.');
    const font = o.fontPt * o.dpi / 72, labelHeight = o.labelPosition === 'below' ? Math.ceil(font * 1.6) : 0;
    const height = rows * (panel + labelHeight) + (rows - 1) * o.gutter;
    const cap = Math.min(8192, Math.max(1, Math.floor(limit)));
    const error = panel > cap ? `Each panel would be ${panel} × ${panel} px; this device supports up to ${cap} × ${cap} px per panel. Reduce width/DPI or add columns. Tiled rendering is not yet available.`
      : height > MAX_DIMENSION || width * height > MAX_PIXELS ? 'Figure exceeds the 64-megapixel composition limit. Reduce width, DPI, or rows.' : '';
    const left = Math.floor((width - cols * panel - (cols - 1) * o.gutter) / 2);
    return { options:o, width, height, cols, rows, panel, font, labelHeight, cap, error,
      slots:Array.from({ length:count }, (_, i) => ({ x:left + i % cols * (panel + o.gutter), y:Math.floor(i / cols) * (panel + labelHeight + o.gutter) })) };
  }
  function svg(plan, images, labels, { background = null, foreground = '#1a2230', fontFamily = 'sans-serif' } = {}) {
    const o = plan.options, lines = [`<svg xmlns="http://www.w3.org/2000/svg" width="${o.widthIn}in" height="${plan.height / o.dpi}in" viewBox="0 0 ${plan.width} ${plan.height}">`];
    if (background) lines.push(`<rect width="100%" height="100%" fill="${escapeXml(background)}"/>`);
    lines.push('<defs>' + plan.slots.map((p,i) => `<clipPath id="label-${i}"><rect x="${p.x}" y="${p.y}" width="${plan.panel}" height="${plan.panel + plan.labelHeight}"/></clipPath>`).join('') + '</defs>');
    plan.slots.forEach((p, i) => {
      lines.push(`<image x="${p.x}" y="${p.y}" width="${plan.panel}" height="${plan.panel}" href="${images[i]}"/>`);
      if (o.border) lines.push(`<rect x="${p.x}" y="${p.y}" width="${plan.panel}" height="${plan.panel}" fill="none" stroke="${escapeXml(foreground)}" stroke-width="${o.dpi / 96}"/>`);
      const x = o.labelPosition === 'below' ? p.x + plan.panel / 2 : p.x + plan.font * .4;
      const y = o.labelPosition === 'below' ? p.y + plan.panel + plan.font * 1.15 : p.y + plan.font * 1.2;
      const outline = o.labelPosition === 'overlay' ? ` paint-order="stroke" stroke="${escapeXml(background || '#ffffff')}" stroke-width="${plan.font * .16}" stroke-linejoin="round"` : '';
      lines.push(`<text x="${x}" y="${y}" text-anchor="${o.labelPosition === 'below' ? 'middle' : 'start'}" font-family="${escapeXml(fontFamily)}" font-size="${plan.font}" fill="${escapeXml(foreground)}" clip-path="url(#label-${i})"${outline}>${escapeXml(labels[i])}</text>`);
    });
    return lines.join('\n') + '\n</svg>';
  }
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
    return (c ^ 0xffffffff) >>> 0;
  }
  // Browsers write 96 dpi. Replace pHYs with the requested print density.
  async function pngDensity(blob, dpi) {
    const data = new Uint8Array(await blob.arrayBuffer()), chunks = [data.slice(0, 8)];
    const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
    view.setUint32(0, 9); chunk.set([112,72,89,115], 4);
    const ppm = Math.round(dpi / .0254); view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
    view.setUint32(17, crc32(chunk.subarray(4,17)));
    for (let i = 8; i + 12 <= data.length;) {
      const length = new DataView(data.buffer, data.byteOffset + i, 4).getUint32(0), end = i + length + 12;
      if (end > data.length) throw new Error('Invalid PNG output.');
      const type = String.fromCharCode(...data.subarray(i+4, i+8));
      if (type !== 'pHYs') chunks.push(data.slice(i, end));
      if (type === 'IHDR') chunks.push(chunk);
      i = end;
    }
    return new Blob(chunks, { type:'image/png' });
  }
  const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the figure. Reduce its size.')), 'image/png'));
  function create(deps) {
    let running = false, canceled = false;
    const list = () => global.VibeMolSceneExport.listTargets(deps.graph);
    async function compose(input = {}) {
      if (running || deps.busy()) throw new Error('Finish the current load, calculation, or export first.');
      const all = list(), requested = input.targets || all.map(t => t.layer.id);
      const targets = requested.map(item => {
        const id = typeof item === 'string' ? item : item.layerId || item.id || item.layer?.id;
        const target = all.find(t => t.layer.id === id);
        if (!target) throw new Error('A selected figure layer is no longer available.');
        return { ...target, label: typeof item === 'object' && item.label != null ? String(item.label).slice(0,500) : stem(target.name) };
      });
      if (new Set(targets.map(t => t.layer.id)).size !== targets.length) throw new Error('Choose each layer only once.');
      const plan = layout(targets.length, input, deps.limits().panel);
      if (plan.error && !input.preview) throw new Error(plan.error);
      const scale = input.preview ? Math.min(1, 720 / Math.max(plan.width, plan.height)) : 1;
      const pixels = Math.max(16, Math.round(plan.panel * scale));
      const colors = deps.colors(plan.options.background), fontFamily = deps.fontFamily();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(plan.width * scale)); canvas.height = Math.max(1, Math.round(plan.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Figure canvas could not be allocated.');
      ctx.scale(scale, scale);
      if (colors.background) { ctx.fillStyle = colors.background; ctx.fillRect(0,0,plan.width,plan.height); }
      const options = { ...plan.options, iso: input.iso ?? deps.sharedIso(targets), signal:input.signal };
      if (!(Number(options.iso) > 0)) throw new Error('Shared iso value must be positive.');
      const images = []; let prepared = false, index = 0;
      const check = () => { if (canceled || input.signal?.aborted) throw new DOMException('Figure canceled.', 'AbortError'); };
      running = true; canceled = false;
      try {
        await document.fonts?.ready;
        await global.VibeMolSceneExport.exportTargets(targets, {
          captureState: () => deps.captureState({ preview:!!input.preview }),
          activate: async target => {
            check();
            if (!prepared) { await deps.prepare(targets, options, plan, check, input.onProgress); prepared = true; }
            deps.activate(target, options); deps.rebuild();
          },
          render: () => {},
          capture: async target => {
            check(); const image = deps.capture(pixels, options);
            try {
              input.onPanel?.({ index, layerId:target.layer.id, ...deps.cameraSnapshot() });
              if (input._forceThrowOnPanel === index + 1) throw new Error('Forced figure capture failure.');
              if (options.format === 'svg' && !input.preview) images.push(image.toDataURL('image/png'));
              const p = plan.slots[index]; ctx.drawImage(image,p.x,p.y,plan.panel,plan.panel);
              ctx.strokeStyle = colors.foreground; ctx.lineWidth = options.dpi / 96;
              if (options.border) ctx.strokeRect(p.x,p.y,plan.panel,plan.panel);
              ctx.font = `${plan.font}px ${fontFamily}`; ctx.fillStyle = colors.foreground; ctx.textBaseline='alphabetic';
              const below = options.labelPosition === 'below'; ctx.textAlign = below ? 'center' : 'left';
              const x = below ? p.x + plan.panel / 2 : p.x + plan.font * .4;
              const y = below ? p.y + plan.panel + plan.font * 1.15 : p.y + plan.font * 1.2;
              ctx.save(); ctx.beginPath(); ctx.rect(p.x,p.y,plan.panel,plan.panel + plan.labelHeight); ctx.clip();
              if (!below) { ctx.strokeStyle=colors.background || '#ffffff'; ctx.lineWidth=plan.font*.16;ctx.lineJoin='round';ctx.strokeText(target.label,x,y); }
              ctx.fillText(target.label,x,y); ctx.restore();
              index++;
              input.onProgress?.(`Rendering panel ${index} of ${targets.length}…`);
            } finally { image.width=1; image.height=1; }
            await new Promise(resolve => setTimeout(resolve, 0));
          },
          restore: deps.restore,
        });
        check();
        if (options.format === 'svg' && !input.preview) return new Blob([svg(plan, images, targets.map(t => t.label), { ...colors, fontFamily })], { type:'image/svg+xml' });
        const blob = await toBlob(canvas);
        return input.preview ? blob : pngDensity(blob, options.dpi);
      } finally { running=false; canvas.width=1;canvas.height=1; }
    }
    return Object.freeze({ compose, cancel:() => { canceled = true; }, isRunning:() => running, list });
  }
  global.VibeMolFigureComposer = Object.freeze({ defaults, layout, svg, pngDensity, stem, create, MAX_PIXELS, MAX_PANELS });
})(typeof window !== 'undefined' ? window : globalThis);
