(function (global) {
  'use strict';

  /*
   * Lasso context for Claude. The user draws around any part of the page; we
   * store a "selection" containing a masked image of the region, the enclosed
   * elements (with refs usable by vibemol_operate_control), where each one is
   * defined in the source (index.html line, JS lines that reference it), and
   * any atoms inside the lasso. Claude reads it with vibemol_get_selection.
   */
  const IGNORE = '[data-agent-ignore], .vm-agent-link';
  const MAX_ELEMENTS = 30;
  const MAX_REFS_PER_ELEMENT = 4;
  const MAX_TEXT_CHARS = 60000;
  const MAX_IMAGE_SIDE = 1024;
  const captures = [];
  let active = null;
  let sourceCache = null;

  // ---- Geometry -------------------------------------------------------------
  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function bounds(poly) {
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }

  function polygonArea(poly) {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    return Math.abs(a / 2);
  }

  // ---- Drawing overlay ------------------------------------------------------
  function startLasso(onDone) {
    if (active) return;
    const doc = global.document;
    const overlay = doc.createElement('div');
    overlay.className = 'vm-agent-lasso';
    overlay.setAttribute('data-agent-ignore', '');
    overlay.innerHTML = '<canvas></canvas><div class="vm-agent-lasso-hint">Draw around what you want Claude to see · Esc to cancel</div>';
    doc.body.appendChild(overlay);
    const canvas = overlay.querySelector('canvas');
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(global.innerWidth * dpr);
    canvas.height = Math.round(global.innerHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    let points = [];
    let drawing = false;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
      if (!drawing) ctx.closePath();
      ctx.fillStyle = 'rgba(80, 140, 255, 0.12)';
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3b82f6';
      ctx.stroke();
    };

    const finish = poly => {
      overlay.remove();
      doc.removeEventListener('keydown', onKey, true);
      active = null;
      onDone(poly);
    };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); } };

    overlay.addEventListener('pointerdown', e => {
      drawing = true;
      points = [[e.clientX, e.clientY]];
      overlay.setPointerCapture(e.pointerId);
    });
    overlay.addEventListener('pointermove', e => {
      if (!drawing) return;
      const [lx, ly] = points[points.length - 1];
      if (Math.hypot(e.clientX - lx, e.clientY - ly) >= 3) { points.push([e.clientX, e.clientY]); draw(); }
    });
    overlay.addEventListener('pointerup', () => {
      drawing = false;
      draw();
      finish(points.length >= 3 && polygonArea(points) >= 64 ? points : null);
    });
    doc.addEventListener('keydown', onKey, true);
    active = overlay;
  }

  // ---- Enclosed elements ----------------------------------------------------
  function isShown(el) {
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const style = global.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  }

  function collectElements(poly) {
    const ui = global.VibeMolAgentUI;
    const box = bounds(poly);
    const tol = 8;
    const found = [];
    for (const el of global.document.body.querySelectorAll('*')) {
      if (el.closest(IGNORE) || /^(SCRIPT|STYLE|LINK|META|BR|OPTION)$/.test(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.left < box.left - tol || r.top < box.top - tol || r.right > box.left + box.width + tol || r.bottom > box.top + box.height + tol) continue;
      if (!pointInPolygon(r.left + r.width / 2, r.top + r.height / 2, poly) || !isShown(el)) continue;
      const control = ui && ui.isControl(el);
      const labeled = el.id || el.getAttribute('aria-label') || el.getAttribute('data-tooltip');
      const media = /^(CANVAS|IMG|SVG|VIDEO)$/i.test(el.tagName);
      const leafText = !el.children.length && el.textContent.trim().length > 0;
      if (!(control || labeled || media || leafText)) continue;
      // Skip text/media inside an enclosed control; the control describes it.
      if (found.some(f => f.control && f.el.contains(el))) continue;
      found.push({ el, control, priority: control ? 0 : (el.id ? 1 : (labeled || media ? 2 : 3)) });
    }
    found.sort((a, b) => a.priority - b.priority);
    return { total: found.length, items: found.slice(0, MAX_ELEMENTS).map(f => f.el) };
  }

  function cssPath(el) {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node.tagName !== 'BODY'; node = node.parentElement) {
      if (node.id) { parts.unshift(`#${node.id}`); break; }
      const cls = Array.from(node.classList).slice(0, 2).map(c => `.${c}`).join('');
      parts.unshift(node.tagName.toLowerCase() + cls);
    }
    return parts.join(' > ');
  }

  function commonContainer(els) {
    if (!els.length) return null;
    let node = els[0].parentElement;
    while (node && !els.every(el => node.contains(el))) node = node.parentElement;
    for (let n = node; n && n.tagName !== 'BODY'; n = n.parentElement) if (n.id) return { id: n.id, path: cssPath(n) };
    return node && node.tagName !== 'BODY' ? { path: cssPath(node) } : null;
  }

  function searchTermsFor(el) {
    const terms = [];
    if (el.id) terms.push({ kind: 'id', value: el.id });
    const label = el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || (!el.children.length ? el.textContent : '');
    const clean = String(label || '').replace(/\s+/g, ' ').trim();
    if (clean && clean.length <= 80) terms.push({ kind: 'text', value: clean });
    return terms;
  }

  // ---- Source lookup --------------------------------------------------------
  async function loadSources() {
    if (sourceCache) return sourceCache;
    const doc = global.document;
    const root = new URL('./', global.location.href);
    const urls = new Set([new URL(global.location.pathname, global.location.origin).href]);
    for (const s of doc.querySelectorAll('script[src]')) {
      const url = new URL(s.getAttribute('src'), global.location.href);
      if (url.origin !== global.location.origin || /\/vendor\/|\.min\.js$|\/agent\//.test(url.pathname)) continue;
      urls.add(url.href);
    }
    const files = [];
    await Promise.all([...urls].map(async href => {
      try {
        const res = await fetch(href, { cache: 'force-cache' });
        if (!res.ok) return;
        const path = href.startsWith(root.href) ? href.slice(root.href.length) || 'index.html' : new URL(href).pathname;
        files.push({ path: path.split('?')[0] || 'index.html', lines: (await res.text()).split('\n') });
      } catch { /* unreadable file: skip */ }
    }));
    sourceCache = files;
    return files;
  }

  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function searchSources(files, terms, limit = MAX_REFS_PER_ELEMENT) {
    const hits = [];
    for (const term of terms) {
      const re = term.kind === 'id'
        ? new RegExp(`(?:['"\`#])${escapeRe(term.value)}(?![\\w-])`)
        : new RegExp(`['"\`>]\\s*${escapeRe(term.value)}\\s*['"\`<]`);
      for (const file of files) {
        file.lines.forEach((line, i) => {
          if (!re.test(line)) return;
          let score = /\.html$/.test(file.path) ? 3 : 1;
          if (/addEventListener|onclick|getElementById|querySelector|\.on[A-Z]\w*\s*=/.test(line)) score += 2;
          if (term.kind === 'id') score += 1;
          if (term.kind === 'id' && new RegExp(`\\bid=["']${escapeRe(term.value)}["']`).test(line)) score += 4; // definition
          hits.push({ file: file.path, line: i + 1, score, match: term.value, lines: file.lines });
          // Follow `const saveBtn = document.getElementById('x')` to where its handlers are attached.
          const bound = /(?:const|let|var)?\s*([A-Za-z_$][\w$]{3,})\s*=\s*(?:document|root|doc)\.(?:getElementById|querySelector)\(/.exec(line);
          if (bound && term.kind === 'id') {
            const handler = new RegExp(`\\b${escapeRe(bound[1])}\\??\\.(?:addEventListener\\(|on[a-z]+\\s*=)`);
            file.lines.forEach((other, k) => {
              if (k !== i && handler.test(other)) hits.push({ file: file.path, line: k + 1, score: 5, match: `${bound[1]} (holds #${term.value})`, lines: file.lines });
            });
          }
        });
      }
    }
    hits.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
    const seen = new Set();
    return hits.filter(h => { const k = `${h.file}:${h.line}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, limit)
      .map(h => ({
        location: `${h.file}:${h.line}`,
        matched: h.match,
        snippet: h.lines.slice(Math.max(0, h.line - 3), h.line + 2).map((l, k) => `${Math.max(1, h.line - 2) + k}: ${l.slice(0, 200)}`).join('\n'),
      }));
  }

  // ---- Image ----------------------------------------------------------------
  function loadHtml2Canvas() {
    if (global.html2canvas) return Promise.resolve(global.html2canvas);
    return new Promise((resolve, reject) => {
      const base = (global.VibeMolAgentConfig || {}).baseUrl || './agent/web/';
      const s = global.document.createElement('script');
      s.src = new URL('vendor/html2canvas.min.js', new URL(base, global.location.href)).href;
      s.onload = () => (global.html2canvas ? resolve(global.html2canvas) : reject(new Error('html2canvas did not load')));
      s.onerror = () => reject(new Error('html2canvas could not be loaded'));
      global.document.head.appendChild(s);
    });
  }

  async function captureRegion(poly) {
    const pad = 6;
    const box = bounds(poly);
    const x = Math.max(0, box.left - pad), y = Math.max(0, box.top - pad);
    const w = Math.min(global.innerWidth - x, box.width + 2 * pad), h = Math.min(global.innerHeight - y, box.height + 2 * pad);
    const scale = Math.min(global.devicePixelRatio || 1, 2, MAX_IMAGE_SIDE / Math.max(w, h));
    let shot;
    try {
      const html2canvas = await loadHtml2Canvas();
      shot = await html2canvas(global.document.body, {
        x: x + global.scrollX, y: y + global.scrollY, width: w, height: h, scale,
        logging: false, useCORS: true,
        backgroundColor: global.getComputedStyle(global.document.body).backgroundColor || null,
        ignoreElements: el => !!(el.closest && el.closest(IGNORE)),
      });
    } catch (error) {
      return { error: `Page image unavailable: ${error.message}` };
    }
    // Dim everything outside the lasso so Claude sees exactly what was circled.
    const out = global.document.createElement('canvas');
    out.width = shot.width; out.height = shot.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(shot, 0, 0);
    const sx = shot.width / w, sy = shot.height / h;
    ctx.beginPath();
    ctx.rect(0, 0, out.width, out.height);
    poly.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (px - x) * sx, (py - y) * sy));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill('evenodd');
    const url = out.toDataURL('image/jpeg', 0.85);
    return { mimeType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), width: out.width, height: out.height };
  }

  // ---- Build + store a selection --------------------------------------------
  async function buildSelection(poly) {
    const ui = global.VibeMolAgentUI;
    const { total, items } = collectElements(poly);
    const files = await loadSources();
    let budget = MAX_TEXT_CHARS;
    const elements = items.map(el => {
      const info = ui ? ui.describeElement(el) : { ref: el.id || '' };
      const html = el.outerHTML.replace(/\s+/g, ' ');
      const entry = {
        ...info,
        tag: el.tagName.toLowerCase(),
        path: cssPath(el),
        html: html.length > 500 ? `${html.slice(0, 500)}…` : html,
        source: searchSources(files, searchTermsFor(el)),
      };
      if (!entry.source.length) entry.source = [{ note: 'No direct source match (likely generated at runtime); see the parent container.' }];
      budget -= JSON.stringify(entry).length;
      return budget > 0 ? entry : null;
    }).filter(Boolean);

    let atoms = null;
    try { atoms = global.VibeMolAgentHost ? global.VibeMolAgentHost.atomsInClientPolygon(poly, pointInPolygon) : null; } catch { atoms = null; }

    const selection = {
      id: `sel-${Date.now().toString(36)}`,
      capturedAt: new Date().toISOString(),
      viewport: { width: global.innerWidth, height: global.innerHeight },
      lassoBounds: bounds(poly),
      container: commonContainer(items),
      elementCount: total,
      elements,
      truncated: total > elements.length,
      atoms,
      image: await captureRegion(poly),
    };
    captures.unshift(selection);
    captures.length = Math.min(captures.length, 5);
    return selection;
  }

  function getSelection({ includeImage = true } = {}) {
    const latest = captures[0];
    if (!latest) throw new Error('No lasso selection yet. Ask the user to click "Lasso" next to Connect Claude and draw around what they mean.');
    const { image, ...rest } = latest;
    const result = { ...rest };
    if (image && image.error) result.imageError = image.error;
    if (includeImage && image && image.data) result.image = image;
    return result;
  }

  function install() {
    const doc = global.document;
    doc.addEventListener('click', event => {
      const button = event.target.closest && event.target.closest('#agentLassoBtn');
      if (!button) return;
      const status = doc.getElementById('agentLassoStatus');
      const say = text => { if (status) status.textContent = text; };
      startLasso(async poly => {
        if (!poly) { say(''); return; }
        say('Capturing selection…');
        try {
          const sel = await buildSelection(poly);
          const parts = [`${sel.elementCount} element${sel.elementCount === 1 ? '' : 's'}`];
          if (sel.atoms && sel.atoms.count) parts.push(`${sel.atoms.count} atom${sel.atoms.count === 1 ? '' : 's'}`);
          say(`Selection captured (${parts.join(', ')}). Ask Claude to look at your VibeMol selection.`);
        } catch (error) {
          say(`Could not capture selection: ${error.message}`);
        }
      });
    });
  }

  global.VibeMolAgentLasso = Object.freeze({
    startLasso, buildSelection, getSelection,
    _internals: { pointInPolygon, polygonArea, searchSources, cssPath },
  });
  if (typeof document !== 'undefined' && global.document && global.document.addEventListener) install();
})(typeof window !== 'undefined' ? window : globalThis);
