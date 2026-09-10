(function (global) {
  'use strict';

  const DATABASE = 'vibemol-session-recovery';
  const MAX_BYTES = 64 * 1024 * 1024;

  function createRecoveryStore(indexedDB = global.indexedDB) {
    let opening;
    function open() {
      if (!opening) opening = new Promise((resolve, reject) => {
        if (!indexedDB) { reject(new Error('Browser storage is unavailable.')); return; }
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
        request.onerror = () => reject(request.error || new Error('Could not open browser storage.'));
        request.onblocked = () => reject(new Error('Browser storage is blocked by another tab.'));
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); opening = null; };
          resolve(request.result);
        };
      }).catch(error => { opening = null; throw error; });
      return opening;
    }
    async function read() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readonly');
        const store = tx.objectStore('snapshots');
        const latest = store.get('latest');
        const previous = store.get('previous');
        tx.oncomplete = () => resolve({ latest: latest.result || null, previous: previous.result || null });
        tx.onabort = tx.onerror = () => reject(tx.error || new Error('Could not read recovery data.'));
      });
    }
    async function write(snapshot, expectedId) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        const store = tx.objectStore('snapshots');
        let error;
        const current = store.get('latest');
        current.onsuccess = () => {
          try {
            const latest = current.result;
            if ((latest && latest.id || null) !== expectedId) {
              error = new Error('Another tab updated recovery data. Download this session to keep both workspaces.');
              error.name = 'RecoveryConflictError';
              tx.abort();
              return;
            }
            if (latest) store.put(latest, 'previous');
            store.put(snapshot, 'latest');
          } catch (failure) { error = failure; tx.abort(); }
        };
        tx.oncomplete = () => resolve(snapshot);
        tx.onabort = tx.onerror = () => reject(error || tx.error || new Error('Could not save recovery data.'));
      });
    }
    return Object.freeze({ read, write });
  }

  // One serialized writer, two bounded snapshots, and an explicit recovery gate.
  // A failed transaction keeps both previously completed snapshots intact.
  function createRecoveryController(deps) {
    const store = deps.store || createRecoveryStore();
    const debounceMs = deps.debounceMs ?? 1500;
    const maxDelayMs = deps.maxDelayMs ?? 15000;
    const maxBytes = deps.maxBytes || MAX_BYTES;
    const now = deps.now || Date.now;
    let ready = false;
    let pending = false;
    let recovering = false;
    let stopped = false;
    let failed = false;
    let revision = 0;
    let savedRevision = 0;
    let firstDirtyAt = null;
    let timer = 0;
    let writing = null;
    let expectedId = null;
    let candidates = [];
    let lastSavedAt = null;

    function status(state, message) {
      if (deps.onStatus) deps.onStatus({ state, message, lastSavedAt });
    }
    function clearTimer() { if (timer) clearTimeout(timer); timer = 0; }
    function schedule() {
      if (stopped || !ready || pending || recovering || failed || revision === savedRevision || !deps.hasWork()) return;
      clearTimer();
      if (firstDirtyAt == null) firstDirtyAt = now();
      const delay = Math.min(debounceMs, Math.max(0, maxDelayMs - (now() - firstDirtyAt)));
      timer = setTimeout(() => { timer = 0; void flush(); }, delay);
    }
    function markDirty() {
      if (stopped || recovering) return;
      revision++;
      schedule();
    }
    async function flush(options = {}) {
      clearTimer();
      if (stopped || !ready || pending || recovering || !deps.hasWork()) return false;
      if (writing) return writing;
      if (failed && !options.force) return false;
      if (revision === savedRevision && !options.force) return false;
      if (deps.isBusy && deps.isBusy()) {
        // Delay without spinning when a calculation, file load, or edit is active.
        timer = setTimeout(() => { timer = 0; void flush(options); }, debounceMs);
        return false;
      }
      failed = false;
      const savingRevision = revision;
      firstDirtyAt = null;
      status('saving', 'Autosaving…');
      writing = (async () => {
        try {
          const text = await deps.exportText({ maxBytes });
          if (text.length > maxBytes * 2) throw new Error('Session is too large for browser recovery.');
          const stamp = new Date(now()).toISOString();
          const snapshot = { id: `${stamp}-${Math.random().toString(36).slice(2)}`, savedAt: stamp,
            name: deps.getName ? deps.getName() : 'VibeMol session', text };
          await store.write(snapshot, expectedId);
          expectedId = snapshot.id;
          candidates = [snapshot, candidates[0]].filter(Boolean);
          lastSavedAt = stamp;
          savedRevision = savingRevision;
          status('saved', `Autosaved at ${new Date(stamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);
          return true;
        } catch (error) {
          failed = true;
          const reason = error && error.name === 'QuotaExceededError' ? 'Browser storage is full.' : String(error && error.message || error);
          status('error', `Autosave failed: ${reason} Use Save session to download your work.`);
          return false;
        } finally { writing = null; schedule(); }
      })();
      return writing;
    }
    async function initialize() {
      try {
        const saved = await store.read();
        if (stopped) return;
        expectedId = saved.latest && saved.latest.id || null;
        candidates = [saved.latest, saved.previous].filter(Boolean);
        pending = candidates.length > 0;
        ready = true;
        if (pending) {
          status('recovery', 'A previous session is available to recover.');
          if (deps.onRecovery) deps.onRecovery(candidates.map(({id, name, savedAt}) => ({id, name, savedAt})));
        } else { status('idle', 'Autosave ready'); schedule(); }
      } catch (error) {
        ready = false;
        status('error', `Autosave unavailable: ${error.message} Use Save session to download your work.`);
      }
    }
    function startFresh() {
      if (recovering) return;
      pending = false;
      failed = false;
      if (deps.onRecovery) deps.onRecovery([]);
      status('idle', 'Autosave ready');
      // Existing snapshots remain available until a new nonempty save succeeds.
      schedule();
    }
    async function recover() {
      if (recovering || writing || !pending) return false;
      recovering = true;
      let lastError;
      try {
        for (let index = 0; index < candidates.length; index++) {
          const candidate = candidates[index];
          try {
            await deps.importText(candidate.text);
            pending = false;
            failed = false;
            savedRevision = revision;
            lastSavedAt = candidate.savedAt;
            if (deps.onRecovery) deps.onRecovery([]);
            status('saved', index ? 'Recovered the previous autosave; the newest snapshot was damaged.' : 'Session recovered. Playback is paused.');
            return true;
          } catch (error) { lastError = error; }
        }
        status('error', `Could not recover the session: ${lastError && lastError.message || 'No valid snapshot.'} Your current workspace is unchanged.`);
        return false;
      } finally { recovering = false; }
    }
    function stop() { stopped = true; clearTimer(); }
    return Object.freeze({ initialize, markDirty, flush, startFresh, recover, stop,
      getState: () => ({ ready, pending, recovering, writing: !!writing, failed, revision, savedRevision, lastSavedAt }) });
  }

  global.VibeMolSessionRecovery = Object.freeze({ DATABASE, MAX_BYTES, createRecoveryStore, createRecoveryController });
})(typeof window !== 'undefined' ? window : globalThis);
