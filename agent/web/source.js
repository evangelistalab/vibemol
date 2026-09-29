(function (global) {
  'use strict';

  /*
   * Read-only access to VibeMol's own source as served to this tab (index.html,
   * app scripts, stylesheets, and the agent's files). Used by the lasso for
   * source locations and by vibemol_read_source so Claude can study existing
   * code before writing extensions. Vendor bundles and minified files are skipped.
   */
  const MAX_LINES_PER_READ = 400;
  const MAX_CHARS_PER_READ = 40000;
  const SKIP = /\/vendor\/|\.min\.(js|css)$/;
  let cache = null;

  function displayPath(href) {
    const root = new URL('./', global.location.href).href;
    const clean = href.split('#')[0].split('?')[0];
    const rel = clean.startsWith(root) ? clean.slice(root.length) : new URL(clean).pathname.replace(/^\//, '');
    return rel || 'index.html';
  }

  async function loadSources({ includeAgent = true } = {}) {
    if (!cache) {
      const doc = global.document;
      const origin = global.location.origin;
      const hrefs = new Set([new URL(global.location.pathname, origin).href]);
      const add = raw => {
        if (!raw) return;
        const url = new URL(raw, global.location.href);
        if (url.origin === origin && !SKIP.test(url.pathname)) hrefs.add(url.href);
      };
      doc.querySelectorAll('script[src]').forEach(s => add(s.getAttribute('src')));
      doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(l => add(l.getAttribute('href')));
      const files = [];
      await Promise.all([...hrefs].map(async href => {
        try {
          const res = await fetch(href, { cache: 'force-cache' });
          if (!res.ok) return;
          files.push({ path: displayPath(href), lines: (await res.text()).split('\n') });
        } catch { /* unreadable: skip */ }
      }));
      files.sort((a, b) => a.path.localeCompare(b.path));
      cache = files;
    }
    return includeAgent ? cache : cache.filter(f => !/^agent\//.test(f.path));
  }

  function findFile(files, name) {
    const want = String(name || '').replace(/^\.?\//, '').split('?')[0];
    const exact = files.find(f => f.path === want);
    if (exact) return exact;
    const suffix = files.filter(f => f.path.endsWith(`/${want}`) || f.path.endsWith(want));
    if (suffix.length === 1) return suffix[0];
    if (suffix.length > 1) throw new Error(`"${name}" matches several files: ${suffix.map(f => f.path).join(', ')}`);
    throw new Error(`No served file "${name}". Call vibemol_read_source without arguments to list files.`);
  }

  /** Pure query over loaded files; see the vibemol_read_source schema. */
  function query(files, args = {}) {
    const { file, query: text, regex = false, start, end, maxResults = 30 } = args;
    if (!file && !text) {
      return { files: files.map(f => ({ path: f.path, lines: f.lines.length })) };
    }
    if (text) {
      let re;
      try {
        re = regex ? new RegExp(text, 'i') : new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      } catch (error) {
        throw new Error(`Invalid regex: ${error.message}`);
      }
      const scope = file ? [findFile(files, file)] : files;
      const limit = Math.max(1, Math.min(100, Number(maxResults) || 30));
      const matches = [];
      let total = 0;
      for (const f of scope) {
        f.lines.forEach((line, i) => {
          if (!re.test(line)) return;
          total += 1;
          if (matches.length < limit) matches.push({ location: `${f.path}:${i + 1}`, text: line.trim().slice(0, 240) });
        });
      }
      return { query: text, total, matches, truncated: total > matches.length };
    }
    const f = findFile(files, file);
    const from = Math.max(1, Math.floor(Number(start) || 1));
    let to = Math.min(f.lines.length, Math.floor(Number(end) || from + 199), from + MAX_LINES_PER_READ - 1);
    const out = [];
    let chars = 0;
    for (let n = from; n <= to; n++) {
      const row = `${n}: ${f.lines[n - 1]}`;
      if (chars + row.length > MAX_CHARS_PER_READ) { to = n - 1; break; }
      out.push(row);
      chars += row.length + 1;
    }
    return { file: f.path, totalLines: f.lines.length, start: from, end: to, nextStart: to < f.lines.length ? to + 1 : null, text: out.join('\n') };
  }

  async function readSource(args = {}) {
    return query(await loadSources(), args);
  }

  global.VibeMolAgentSource = Object.freeze({ loadSources, readSource, _internals: { query, findFile } });
})(typeof window !== 'undefined' ? window : globalThis);
