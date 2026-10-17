(function (global) {
  'use strict';

  function createPubChemController(deps) {
    const {
      els,
      escapeHtml,
      setTooltipText,
      setHintMessage,
      parseXYZ,
      handleSceneDropRecords,
      setVolumes,
      setCurrentIndex,
      clearSceneMeshes,
      clearEditHistory,
      appendParsedVolumeRecord,
      finalizeLoadedVolumes,
      setNavigationHint,
    } = deps;

    const PUBCHEM_SEARCH_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

    const PUBCHEM_AUTOCOMPLETE_LIMIT = 10;
    let pubchemBusy = false;
    let pubchemSuggestTimer = null;
    let pubchemSuggestToken = 0;
    const pubchemHas3DByNameCache = new Map();
    const pubchemHas3DByCidCache = new Map();

    /**
     * Render PubChem metadata for the active record.
     * @param {*} record
     */
    function updatePubChemMetadataPanel(record) {
      if (!els.pubchemMetaContent) return;
      const meta = record && record.pubchemMeta;
      if (!meta) {
        if (els.pubchemMetaWrap) els.pubchemMetaWrap.style.display = 'none';
        els.pubchemMetaContent.innerHTML = '';
        return;
      }
      if (els.pubchemMetaWrap) els.pubchemMetaWrap.style.display = 'block';
      const rows = [
        ['Name', meta.title || '—'],
        ['CID', meta.cid != null ? String(meta.cid) : '—'],
        ['Formula', meta.molecularFormula || '—'],
        ['Molar mass', meta.molecularWeight ? `${meta.molecularWeight} g/mol` : '—'],
        ['IUPAC', meta.iupacName || '—'],
        ['SMILES', meta.connectivitySmiles || '—'],
        ['Source', meta.source || 'PubChem']
      ];
      if (meta.query) rows.splice(1, 0, ['Query', meta.query]);
      if (meta.url) rows.push(['URL', meta.url]);
      const body = rows.map(([k, v]) => {
        return `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`;
      }).join('');
      els.pubchemMetaContent.innerHTML = `<table class="meta-table pubchem-metadata"><tbody>${body}</tbody></table>`;
    }

    /**
     * Update PubChem autocomplete options.
     * @param {string[]} terms
     */
    function setPubChemSuggestions(terms) {
      if (!els.pubchemSuggestionsEl) return;
      els.pubchemSuggestionsEl.innerHTML = '';
      for (const term of terms) {
        const opt = document.createElement('option');
        opt.value = term;
        els.pubchemSuggestionsEl.appendChild(opt);
      }
    }

    /**
     * Normalize a PubChem search string.
     * @param {*} value
     * @returns {string}
     */
    function normalizePubChemQuery(value) {
      return String(value || '').trim();
    }

    /**
     * Build a canonical PubChem compound URL for one CID.
     * @param {number} cid
     * @returns {string}
     */
    function getPubChemCompoundUrl(cid) {
      return `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
    }

    /**
     * Fetch JSON from PubChem with consistent error handling.
     * @param {string} url
     * @param {string} context
     * @param {{allow404?:boolean}=} options
     * @returns {Promise<object|null>}
     */
    async function fetchPubChemJson(url, context, options = {}) {
      const allow404 = !!options.allow404;
      const res = await fetch(url);
      if (allow404 && res.status === 404) return null;
      if (!res.ok) throw new Error(`${context} failed (${res.status})`);
      return await res.json();
    }

    /**
     * Fetch text from PubChem with consistent error handling.
     * @param {string} url
     * @param {string} context
     * @returns {Promise<string>}
     */
    async function fetchPubChemText(url, context) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${context} failed (${res.status})`);
      return await res.text();
    }

    /**
     * Read CID list from a PUG JSON payload.
     * @param {*} data
     * @returns {number[]}
     */
    function extractPubChemCidList(data) {
      const cidsRaw = data && data.IdentifierList && Array.isArray(data.IdentifierList.CID)
        ? data.IdentifierList.CID
        : [];
      return cidsRaw.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    }

    /**
     * Build minimal metadata when PubChem property lookup is unavailable.
     * @param {number} cid
     * @param {string} query
     * @returns {{cid:number,query:string,source:string,url:string}}
     */
    function buildPubChemMetadataFallback(cid, query) {
      return {
        cid,
        query: normalizePubChemQuery(query),
        source: 'PubChem',
        url: getPubChemCompoundUrl(cid),
      };
    }

    /**
     * Check whether a conformer endpoint exists for one PubChem lookup target.
     * @param {string} cacheKey
     * @param {Map<string|number,boolean>} cache
     * @param {string} url
     * @param {string} context
     * @returns {Promise<boolean>}
     */
    async function hasPubChemConformer(cacheKey, cache, url, context) {
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const data = await fetchPubChemJson(url, context, { allow404: true });
      const has3D = !!data;
      cache.set(cacheKey, has3D);
      return has3D;
    }

    /**
     * Fetch compound name suggestions from PubChem autocomplete API.
     * @param {string} query
     * @param {number} limit
     * @returns {Promise<string[]>}
     */
    async function fetchPubChemSuggestions(query, limit = PUBCHEM_AUTOCOMPLETE_LIMIT) {
      const q = normalizePubChemQuery(query);
      if (!q) return [];
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q)}/JSON?limit=${Math.max(1, Math.min(25, limit | 0))}`;
      const data = await fetchPubChemJson(url, 'PubChem autocomplete');
      const terms = (data && data.dictionary_terms && Array.isArray(data.dictionary_terms.compound))
        ? data.dictionary_terms.compound
        : [];
      const seen = new Set();
      const unique = [];
      for (const t of terms) {
        if (typeof t !== 'string') continue;
        const key = t.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(t.trim());
      }
      if (unique.length === 0) return unique;

      // Keep only entries that have at least one 3D conformer record.
      const checks = await Promise.all(
        unique.map(async (term) => {
          try {
            return await hasPubChem3DByName(term);
          } catch (err) {
            console.warn('[PubChem] 3D availability check failed', term, err);
            return false;
          }
        })
      );

      const filtered = [];
      for (let i = 0; i < unique.length; i++) {
        if (checks[i]) filtered.push(unique[i]);
      }
      return filtered;
    }

    /**
     * Check whether a PubChem name has at least one 3D conformer entry.
     * Results are memoized to keep autocomplete responsive.
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    async function hasPubChem3DByName(name) {
      const q = normalizePubChemQuery(name);
      if (!q) return false;
      const cacheKey = q.toLowerCase();
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/conformers/JSON`;
      return await hasPubChemConformer(cacheKey, pubchemHas3DByNameCache, url, 'PubChem conformer lookup');
    }

    /**
     * Check whether one CID has at least one 3D conformer.
     * @param {number} cid
     * @returns {Promise<boolean>}
     */
    async function hasPubChem3DByCid(cid) {
      const n = Number(cid);
      if (!Number.isFinite(n)) return false;
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${n}/conformers/JSON`;
      return await hasPubChemConformer(n, pubchemHas3DByCidCache, url, 'PubChem CID conformer lookup');
    }

    /**
     * Resolve the first CID that matches a PubChem name query.
     * When `require3D` is set, returns the first CID with a 3D conformer.
     * @param {string} name
     * @param {{require3D?:boolean}=} options
     * @returns {Promise<number>}
     */
    async function fetchPubChemCidByName(name, options = {}) {
      const require3D = !!options.require3D;
      const q = normalizePubChemQuery(name);
      if (!q) throw new Error('Empty PubChem query.');
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/cids/JSON`;
      const data = await fetchPubChemJson(url, 'PubChem CID lookup');
      const cids = extractPubChemCidList(data);
      if (cids.length === 0) throw new Error(`No PubChem CID found for "${q}".`);
      if (!require3D) return cids[0];

      for (const cid of cids.slice(0, 24)) {
        try {
          if (await hasPubChem3DByCid(cid)) return cid;
        } catch (err) {
          console.warn('[PubChem] CID 3D check failed', cid, err);
        }
      }
      throw new Error(`No PubChem 3D structure found for "${q}".`);
    }

    /**
     * Fetch an SDF record for one PubChem CID.
     * Prefers 3D coordinates and optionally requires 3D-only mode.
     * @param {number} cid
     * @param {{require3D?:boolean}=} options
     * @returns {Promise<string>}
     */
    async function fetchPubChemSdfByCid(cid, options = {}) {
      const require3D = !!options.require3D;
      const modes = require3D ? ['3d'] : ['3d', '2d'];
      let lastStatus = 0;
      for (const recordType of modes) {
        const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=${recordType}`;
        try {
          return await fetchPubChemText(url, 'PubChem SDF fetch');
        } catch (err) {
          const msg = String((err && err.message) || err || '');
          const m = msg.match(/\((\d+)\)$/);
          lastStatus = m ? Number(m[1]) : lastStatus;
        }
      }
      throw new Error(`PubChem SDF fetch failed for CID ${cid} (${lastStatus || 'no response'}).`);
    }

    /**
     * Fetch selected metadata fields for one PubChem CID.
     * @param {number} cid
     * @param {string} query
     * @returns {Promise<{cid:number,query:string,title:string,molecularFormula:string,molecularWeight:string,iupacName:string,connectivitySmiles:string,source:string,url:string}>}
     */
    async function fetchPubChemMetadata(cid, query = '') {
      const n = Number(cid);
      if (!Number.isFinite(n)) throw new Error(`Invalid PubChem CID: ${cid}`);
      const fields = [
        'Title',
        'IUPACName',
        'MolecularFormula',
        'MolecularWeight',
        'ConnectivitySMILES'
      ].join(',');
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${n}/property/${fields}/JSON`;
      const data = await fetchPubChemJson(url, 'PubChem metadata lookup');
      const prop = data && data.PropertyTable && Array.isArray(data.PropertyTable.Properties)
        ? data.PropertyTable.Properties[0]
        : null;
      if (!prop || typeof prop !== 'object') throw new Error(`No PubChem metadata found for CID ${n}.`);
      return {
        cid: n,
        query: normalizePubChemQuery(query),
        title: (typeof prop.Title === 'string' && prop.Title.trim()) ? prop.Title.trim() : '',
        molecularFormula: typeof prop.MolecularFormula === 'string' ? prop.MolecularFormula : '',
        molecularWeight: typeof prop.MolecularWeight === 'string' ? prop.MolecularWeight : '',
        iupacName: typeof prop.IUPACName === 'string' ? prop.IUPACName : '',
        connectivitySmiles: typeof prop.ConnectivitySMILES === 'string' ? prop.ConnectivitySMILES : '',
        source: 'PubChem',
        url: getPubChemCompoundUrl(n)
      };
    }

    /**
     * Convert an SDF mol block to XYZ text for existing parser reuse.
     * @param {string} sdfText
     * @param {string} fallbackTitle
     * @returns {string}
     */
    function sdfToXYZText(sdfText, fallbackTitle) {
      const lines = String(sdfText || '').replace(/\r/g, '').split('\n');
      if (lines.length < 5) throw new Error('Invalid SDF payload from PubChem.');
      const countsLine = lines[3] || '';
      let natoms = parseInt(countsLine.slice(0, 3).trim(), 10);
      if (!Number.isFinite(natoms)) {
        const c = countsLine.trim().split(/\s+/);
        natoms = parseInt(c[0] || '', 10);
      }
      if (!Number.isFinite(natoms) || natoms <= 0) throw new Error('Could not parse atom count from PubChem SDF.');

      const atomLines = lines.slice(4, 4 + natoms);
      if (atomLines.length !== natoms) throw new Error('PubChem SDF ended before atom block completed.');

      const xyzRows = [];
      for (const line of atomLines) {
        let x = parseFloat(line.slice(0, 10));
        let y = parseFloat(line.slice(10, 20));
        let z = parseFloat(line.slice(20, 30));
        let sym = line.slice(31, 34).trim();
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !sym) {
          const p = line.trim().split(/\s+/);
          x = parseFloat(p[0]);
          y = parseFloat(p[1]);
          z = parseFloat(p[2]);
          sym = p[3] || '';
        }
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !sym) {
          throw new Error('Failed to parse PubChem SDF atom coordinates.');
        }
        xyzRows.push(`${sym} ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
      }

      return `${xyzRows.length}\n${fallbackTitle}\n${xyzRows.join('\n')}\n`;
    }

    /**
     * Enable/disable the PubChem load button during network calls.
     * @param {boolean} busy
     */
    function setPubChemBusy(busy) {
      pubchemBusy = !!busy;
      if (!els.pubchemLoadBtn) return;
      els.pubchemLoadBtn.disabled = pubchemBusy;
      els.pubchemLoadBtn.innerHTML = pubchemBusy
        ? '<span class="vm-spinner" aria-hidden="true"></span>'
        : PUBCHEM_SEARCH_ICON_SVG;
      setTooltipText(els.pubchemLoadBtn, pubchemBusy
        ? 'Loading PubChem…'
        : 'Search PubChem and load the selected molecule');
      els.pubchemLoadBtn.setAttribute('aria-label', pubchemBusy ? 'Loading PubChem' : 'Search PubChem');
      els.pubchemLoadBtn.setAttribute('aria-busy', pubchemBusy ? 'true' : 'false');
    }

    /**
     * Import one molecule from PubChem name query and append it as XYZ.
     * @param {string} rawQuery
     * @returns {Promise<void>}
     */
    async function loadPubChemCompound(rawQuery) {
      const query = normalizePubChemQuery(rawQuery);
      if (!query || pubchemBusy) return;
      setPubChemBusy(true);
      try {
        setHintMessage(`PubChem: searching "${query}"...`);
        const cid = await fetchPubChemCidByName(query, { require3D: true });
        const sdfText = await fetchPubChemSdfByCid(cid, { require3D: true });
        let pubchemMeta = null;
        try {
          pubchemMeta = await fetchPubChemMetadata(cid, query);
        } catch (metaErr) {
          console.warn('[PubChem] metadata lookup failed', metaErr);
        }
        const xyzText = sdfToXYZText(sdfText, `PubChem CID ${cid} ${query}`);
        const vol = parseXYZ(xyzText);
        if (!vol || !Array.isArray(vol.atoms) || vol.atoms.length === 0) {
          throw new Error('PubChem import produced an empty structure.');
        }
        vol.title = `PubChem CID ${cid}`;
        vol.comment = query;
        const handled = handleSceneDropRecords([{
          name: `${query} [CID ${cid}].xyz`,
          fileKind: 'xyz',
          vol,
          extras: {
            pubchemMeta: pubchemMeta || buildPubChemMetadataFallback(cid, query),
          },
        }], { skipAutoIsoOnInitialRebuild: true });
        if (!handled) {
          setVolumes([]);
          setCurrentIndex(-1);
          clearSceneMeshes();
          clearEditHistory();
          const startIndex = 0;
          appendParsedVolumeRecord(
            `${query} [CID ${cid}].xyz`,
            vol,
            {
              pubchemMeta: pubchemMeta || buildPubChemMetadataFallback(cid, query),
              inferBondOrders: true,
            }
          );
          finalizeLoadedVolumes(startIndex);
        }
        setNavigationHint(`Loaded PubChem: ${query} (CID ${cid})`);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error('[PubChem] import failed', err);
        setHintMessage(`PubChem import failed: ${msg}`);
        alert(`PubChem import failed: ${msg}`);
      } finally {
        setPubChemBusy(false);
      }
    }

    /**
     * Debounced autocomplete lookup for the PubChem query input.
     */
    function schedulePubChemSuggestions() {
      if (!els.pubchemQueryInput) return;
      if (pubchemSuggestTimer) clearTimeout(pubchemSuggestTimer);
      const query = normalizePubChemQuery(els.pubchemQueryInput.value);
      if (query.length < 2) {
        setPubChemSuggestions([]);
        return;
      }
      const token = ++pubchemSuggestToken;
      pubchemSuggestTimer = setTimeout(async () => {
        try {
          const terms = await fetchPubChemSuggestions(query, PUBCHEM_AUTOCOMPLETE_LIMIT);
          if (token !== pubchemSuggestToken) return;
          setPubChemSuggestions(terms);
        } catch (err) {
          if (token !== pubchemSuggestToken) return;
          console.warn('[PubChem] autocomplete failed', err);
          setPubChemSuggestions([]);
        }
      }, 240);
    }

    function bindControls() {
      if (els.pubchemQueryInput) {
        els.pubchemQueryInput.addEventListener('input', schedulePubChemSuggestions);
        els.pubchemQueryInput.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          loadPubChemCompound(els.pubchemQueryInput.value);
        });
      }
      if (els.pubchemLoadBtn) els.pubchemLoadBtn.onclick = () => loadPubChemCompound(els.pubchemQueryInput ? els.pubchemQueryInput.value : '');
    }

    return Object.freeze({ updatePubChemMetadataPanel, bindControls });
  }

  global.VibeMolPubChem = Object.freeze({ createPubChemController });
})(typeof window !== 'undefined' ? window : globalThis);
