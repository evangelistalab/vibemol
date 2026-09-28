(function (global) {
  'use strict';

  /*
   * Agent host: everything the connector does to the app, built only from the
   * narrow window.VibeMolAgentSeam that assets/app/js/app.js exposes. Mutations
   * reuse the app's own snapshot/undo and Edit-mode primitives.
   */
  const seam = () => {
    const s = global.VibeMolAgentSeam;
    if (!s) throw new Error('VibeMol is still starting; try again in a moment.');
    return s;
  };

  const nativeScale = vol => (vol && vol.units === 'angstrom' ? 1 : seam().bohrToAngstrom);

  function activeRecord(required = true) {
    const record = seam().getActiveRecord();
    if (!record && required) throw new Error('No active structure.');
    return record;
  }

  function getCameraAxes() {
    const q = seam().getCamera().quaternion;
    const axis = (x, y, z) => new global.THREE.Vector3(x, y, z).applyQuaternion(q).toArray();
    return { right: axis(1, 0, 0), up: axis(0, 1, 0), towardViewer: axis(0, 0, 1) };
  }

  // ---- State -------------------------------------------------------------
  function summarizeRecord(rec) {
    const S = seam();
    const vol = rec && rec.vol;
    const atoms = vol && Array.isArray(vol.atoms) ? vol.atoms : [];
    const elements = {};
    for (const atom of atoms) {
      const symbol = S.getElementSymbol((atom && atom.Z) | 0);
      elements[symbol] = (elements[symbol] || 0) + 1;
    }
    return { name: String(rec && rec.name || ''), atomCount: atoms.length, elements, hasVolumetricGrid: !!(vol && S.hasVolumetricGrid(vol)) };
  }

  function getSummary() {
    const S = seam();
    const record = activeRecord(false);
    let active = null;
    if (record) {
      active = summarizeRecord(record);
      const mass = S.computeMassProperties(record.vol);
      const scale = nativeScale(record.vol);
      if (mass) active.centerOfMassAngstrom = [mass.comX * scale, mass.comY * scale, mass.comZ * scale];
    }
    return {
      mode: S.getMode(),
      structures: S.getRecords().map(summarizeRecord),
      activeIndex: S.getActiveIndex(),
      active,
      trajectoryCount: S.getAllTrajectoryInfos().length,
      camera: getCameraAxes(),
    };
  }

  // ---- Whole-molecule moves ---------------------------------------------
  function translateActiveMoleculeAngstrom(dxAng, dyAng, dzAng, label = 'Translate molecule') {
    const S = seam();
    if (S.isDragging()) throw new Error('Finish the current drag before moving the molecule.');
    const record = activeRecord();
    const vol = record.vol;
    if (!Array.isArray(vol.atoms) || vol.atoms.length === 0) throw new Error('Active file has no atoms.');
    const moved = [Number(dxAng) || 0, Number(dyAng) || 0, Number(dzAng) || 0];
    const [dx, dy, dz] = moved.map(v => v / nativeScale(vol));
    if (!Number.isFinite(dx + dy + dz)) throw new Error('Translation must be finite.');
    const beforeSnapshot = S.cloneCoordinateSnapshot(vol);
    for (const atom of vol.atoms) {
      atom.x = (Number(atom.x) || 0) + dx;
      atom.y = (Number(atom.y) || 0) + dy;
      atom.z = (Number(atom.z) || 0) + dz;
    }
    S.translateVolumetricGrid(vol, dx, dy, dz);
    S.finalizeCoordinateSnapshotEdit(record, vol, beforeSnapshot, label);
    S.setHint(`Moved ${record.name || 'molecule'} by ${Math.hypot(...moved).toFixed(3)} A.`);
    return { movedAngstrom: moved };
  }

  function captureImage(maxSize = 768) {
    const src = seam().getCanvas();
    const limit = Math.max(256, Math.min(1280, Number(maxSize) || 768));
    const ratio = Math.min(1, limit / Math.max(src.width, src.height));
    const out = global.document.createElement('canvas');
    out.width = Math.max(1, Math.round(src.width * ratio));
    out.height = Math.max(1, Math.round(src.height * ratio));
    out.getContext('2d').drawImage(src, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL('image/jpeg', 0.82);
    return { mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), width: out.width, height: out.height };
  }

  // ---- Trajectories -------------------------------------------------------
  function assertNotRecording() {
    if (seam().isRecordingVideo()) throw new Error('A trajectory video is recording; wait for it to finish.');
  }

  function describeTrajectory(info) {
    return {
      sceneId: String(info.scene && info.scene.id || ''),
      name: String((info.scene && info.scene.name) || (info.record && info.record.name) || ''),
      frameCount: info.frameCount,
      frame: Math.max(0, Number(info.traj.frameIndex) | 0),
      fps: Number(info.traj.fps) || null,
      playing: !!info.traj.playing,
      loop: info.traj.loop !== false,
      synced: !!info.traj.syncEnabled,
    };
  }

  function listTrajectories() {
    const S = seam();
    const master = S.getTrajectorySyncMaster();
    return {
      trajectories: S.getAllTrajectoryInfos().map(describeTrajectory),
      syncMaster: { playing: !!master.playing, frame: master.frame, fps: master.fps },
    };
  }

  function resolveTrajectories(sceneIds) {
    const all = seam().getAllTrajectoryInfos();
    if (!all.length) throw new Error('No multi-frame trajectories are loaded.');
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) return all;
    return sceneIds.map(id => {
      const info = all.find(item => String(item.scene && item.scene.id || '') === String(id));
      if (!info) throw new Error(`No trajectory with sceneId ${id}. Call vibemol_list_trajectories.`);
      return info;
    });
  }

  function setTrajectorySync(sceneIds, enabled) {
    const S = seam();
    assertNotRecording();
    const ids = resolveTrajectories(sceneIds).map(info => String(info.scene.id));
    // Re-resolve each time: enabling sync re-maps frames for the whole group.
    for (const id of ids) S.setTrajectorySyncEnabled(S.getTrajectoryInfoBySceneId(id), !!enabled);
    S.setHint(`${enabled ? 'Synced' : 'Unsynced'} ${ids.length} trajector${ids.length === 1 ? 'y' : 'ies'}.`);
    return listTrajectories();
  }

  function setTrajectoryPlayback(sceneIds, action, frame) {
    const S = seam();
    assertNotRecording();
    const infos = resolveTrajectories(sceneIds);
    if (action === 'play' || action === 'pause') {
      for (const info of infos) S.setTrajectoryPlayingForInfo(info, action === 'play');
    } else if (action === 'frame') {
      const target = Math.max(0, Math.floor(Number(frame) || 0));
      if (infos.some(info => info.traj.syncEnabled)) {
        S.getTrajectorySyncMaster().frame = target;
        S.applyMasterFrameToSyncedTrajectories(S.getAllTrajectoryInfos(), { syncUi: false });
      }
      for (const info of infos) {
        if (!info.traj.syncEnabled) S.applyTrajectoryFrameForInfo(info, Math.min(target, info.frameCount - 1), { syncUi: false });
      }
      S.syncTrajectoryControls();
    } else {
      throw new Error('action must be play, pause, or frame.');
    }
    return listTrajectories();
  }

  // ---- Atoms ----------------------------------------------------------------
  function resolveElementZ(element) {
    if (Number.isInteger(element) && element > 0) return element;
    const table = typeof ATOM_SYMBOL_TO_Z !== 'undefined' ? ATOM_SYMBOL_TO_Z : null; // global from atomic-data.js
    const z = table && table[String(element || '').trim().toUpperCase()];
    if (!Number.isInteger(z)) throw new Error(`Unknown element "${element}".`);
    return z;
  }

  function listAtoms(start = 0, count = 200) {
    const S = seam();
    const vol = activeRecord().vol;
    const atoms = Array.isArray(vol.atoms) ? vol.atoms : [];
    const scale = nativeScale(vol);
    const from = Math.max(0, Math.floor(Number(start) || 0));
    const to = Math.min(atoms.length, from + Math.max(1, Math.min(1000, Math.floor(Number(count) || 200))));
    const round = v => Math.round((Number(v) || 0) * scale * 1e5) / 1e5;
    return {
      total: atoms.length,
      atoms: atoms.slice(from, to).map((atom, i) => ({
        index: from + i, element: S.getElementSymbol(atom.Z | 0), x: round(atom.x), y: round(atom.y), z: round(atom.z),
        ...(atom.formalCharge ? { formalCharge: atom.formalCharge } : {}),
      })),
      selection: (S.getEditAtomSelection() || []).slice(0, 1000),
    };
  }

  function checkIndices(indices) {
    const record = activeRecord();
    const n = record.vol.atoms.length;
    const list = (Array.isArray(indices) ? indices : []).map(Number);
    if (!list.length) throw new Error('indices must be a non-empty array of atom indices (0-based).');
    const bad = list.filter(i => !Number.isInteger(i) || i < 0 || i >= n);
    if (bad.length) throw new Error(`Atom indices out of range (0-${n - 1}): ${bad.join(', ')}`);
    return { record, list };
  }

  function editAtoms(op = {}) {
    const S = seam();
    if (S.isDragging()) throw new Error('Finish the current drag first.');
    const countAtoms = () => { const r = activeRecord(false); return r ? r.vol.atoms.length : 0; };
    const before = countAtoms();
    switch (op.operation) {
      case 'select': {
        S.setEditAtomSelection(checkIndices(op.indices).list);
        S.updateSelectedHalos();
        break;
      }
      case 'delete': {
        if (!S.deleteAtomsByIndex(checkIndices(op.indices).list)) throw new Error('Nothing was deleted.');
        break;
      }
      case 'set_element': {
        const { list } = checkIndices(op.indices);
        const z = resolveElementZ(op.element);
        for (const index of list) S.replaceAtomElementAtIndex(index, z);
        break;
      }
      case 'add': {
        activeRecord();
        const pos = Array.isArray(op.position) ? op.position.map(Number) : null;
        if (!pos || pos.length !== 3 || !pos.every(Number.isFinite)) throw new Error('position must be [x, y, z] in Angstrom.');
        if (!S.appendAtomAtWorld(new global.THREE.Vector3(pos[0], pos[1], pos[2]), resolveElementZ(op.element))) throw new Error('Could not add the atom.');
        S.finalizeAddAtomOperatorSession({ announce: false });
        break;
      }
      case 'move': {
        const { record, list } = checkIndices(op.indices);
        const vol = record.vol;
        const d = (Array.isArray(op.delta) ? op.delta : []).map(v => (Number(v) || 0) / nativeScale(vol));
        if (d.length !== 3) throw new Error('delta must be [dx, dy, dz] in Angstrom.');
        const beforeSnapshot = S.cloneCoordinateSnapshot(vol);
        for (const index of new Set(list)) {
          const atom = vol.atoms[index];
          atom.x += d[0]; atom.y += d[1]; atom.z += d[2];
        }
        S.finalizeCoordinateSnapshotEdit(record, vol, beforeSnapshot, `Agent: move ${list.length} atom${list.length === 1 ? '' : 's'}`);
        break;
      }
      default:
        throw new Error('operation must be select, add, delete, set_element, or move.');
    }
    return { operation: op.operation, atomCountBefore: before, atomCountAfter: countAtoms() };
  }

  global.VibeMolAgentHost = Object.freeze({
    getSummary,
    getCameraAxes,
    translateActiveMoleculeAngstrom,
    centerActiveMoleculeMassAtOrigin: () => seam().centerActiveMoleculeMassAtOrigin(),
    undo: () => seam().undo(),
    redo: () => seam().redo(),
    captureImage,
    setHint: message => seam().setHint(message),
    listTrajectories,
    setTrajectorySync,
    setTrajectoryPlayback,
    listAtoms,
    editAtoms,
  });
})(typeof window !== 'undefined' ? window : globalThis);
