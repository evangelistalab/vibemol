(function (global) {
  'use strict';

  function createTrajectoryUi(deps) {
    const { anyTrajectorySyncEnabled, applyMasterFrameToSyncedTrajectories, applyTrajectoryFrameForInfo, focusTrajectoryInfoScene, getActiveTrajectoryInfo, getAllTrajectoryInfos, getTrajectoryInfoBySceneId, getTrajectoryMasterMaxFrames, getTrajectorySyncMaster, isRecording, normalizeTrajectoryMasterFrame, setElementTextPreservingNode, setTrajectoryPlayingForInfo, setTrajectorySyncEnabled, syncTrajectoryControls, trajectorySceneListEl, trajectorySyncMasterEl } = deps;

    let trajectoryPopoverStructureKey = '';

    const trajectorySceneRowRefs = new Map();

    let trajectoryMasterRefs = null;

    function setTrajectoryMiniButtonGlyph(btn, glyph) {
      if (!btn) return;
      setElementTextPreservingNode(btn, String(glyph || ''));
    }

    function getTrajectoryInfoKey(info) {
      return String(info && info.scene && info.scene.id || info && info.record && info.record.name || '');
    }

    function isControlValueInFlight(el) {
      return !!(el && (
        document.activeElement === el
        || (el.dataset && el.dataset.vmInteracting === 'true')
        || (el.matches && el.matches(':active'))
      ));
    }

    function setInputValueIfIdle(input, value) {
      if (!input || isControlValueInFlight(input)) return;
      input.value = String(value);
    }

    function setTrajectorySyncDisabledClass(el, disabled) {
      if (!el) return;
      el.disabled = !!disabled;
      el.classList.toggle('is-sync-disabled', !!disabled);
    }

    function createTrajectoryControlLabel(text, inputEl) {
      const label = document.createElement('label');
      label.style.width = 'auto';
      label.style.display = 'inline-flex';
      label.style.alignItems = 'center';
      label.style.gap = '4px';
      const span = document.createElement('span');
      span.textContent = text;
      label.appendChild(span);
      if (inputEl) label.appendChild(inputEl);
      return label;
    }

    function armRangeInputInteractionTracking(input) {
      if (!input) return;
      const clear = () => {
        if (input.dataset) delete input.dataset.vmInteracting;
      };
      input.addEventListener('pointerdown', () => {
        if (input.dataset) input.dataset.vmInteracting = 'true';
      });
      input.addEventListener('pointerup', clear);
      input.addEventListener('pointercancel', clear);
      input.addEventListener('change', clear);
      input.addEventListener('blur', clear);
    }

    function buildTrajectorySceneRow(info) {
      const sceneId = String(info && info.scene && info.scene.id || '');
      const row = document.createElement('div');
      row.className = 'trajectorySceneRow';
      row.dataset.sceneId = sceneId;

      const title = document.createElement('div');
      title.className = 'trajectorySceneTitle';
      const name = document.createElement('span');
      title.appendChild(name);
      const syncedLabel = document.createElement('span');
      syncedLabel.className = 'trajectorySyncedBadge';
      syncedLabel.textContent = 'synced';
      syncedLabel.hidden = true;
      title.appendChild(syncedLabel);
      row.appendChild(title);

      const controls = document.createElement('div');
      controls.className = 'trajectorySceneControls';

      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'trajectoryMiniButton';
      play.addEventListener('click', () => {
        const current = getTrajectoryInfoBySceneId(sceneId);
        if (!(current && current.enabled && current.traj)) return;
        focusTrajectoryInfoScene(current);
        setTrajectoryPlayingForInfo(current, !current.traj.playing);
      });
      controls.appendChild(play);

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'trajectoryMiniButton';
      setTrajectoryMiniButtonGlyph(reset, 'replay');
      reset.setAttribute('aria-label', 'Reset trajectory');
      reset.addEventListener('click', () => {
        const current = getTrajectoryInfoBySceneId(sceneId);
        if (!(current && current.enabled && current.traj) || current.traj.syncEnabled) return;
        focusTrajectoryInfoScene(current);
        current.traj._lastStepMs = 0;
        applyTrajectoryFrameForInfo(current, 0, { syncUi: true });
      });
      controls.appendChild(reset);

      const readout = document.createElement('span');
      readout.className = 'trajectoryFrameReadout';
      controls.appendChild(readout);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.step = '1';
      armRangeInputInteractionTracking(slider);
      slider.addEventListener('input', () => {
        const current = getTrajectoryInfoBySceneId(sceneId);
        if (!(current && current.enabled && current.traj) || current.traj.syncEnabled) return;
        focusTrajectoryInfoScene(current);
        setTrajectoryPlayingForInfo(current, false);
        applyTrajectoryFrameForInfo(current, Number(slider.value), { syncUi: true });
      });
      controls.appendChild(slider);

      const fps = document.createElement('input');
      fps.type = 'number';
      fps.min = '1';
      fps.max = '120';
      fps.step = '1';
      fps.addEventListener('change', () => {
        const current = getTrajectoryInfoBySceneId(sceneId);
        if (!(current && current.enabled && current.traj) || current.traj.syncEnabled) return;
        focusTrajectoryInfoScene(current);
        current.traj.fps = Math.max(1, Math.min(120, Math.round(Number(fps.value) || 12)));
        current.traj._lastStepMs = 0;
        syncTrajectoryControls();
      });
      controls.appendChild(createTrajectoryControlLabel('FPS', fps));

      const loop = document.createElement('input');
      loop.type = 'checkbox';
      loop.addEventListener('change', () => {
        const current = getTrajectoryInfoBySceneId(sceneId);
        if (!(current && current.enabled && current.traj)) return;
        focusTrajectoryInfoScene(current);
        current.traj.loop = !!loop.checked;
        syncTrajectoryControls();
      });
      controls.appendChild(createTrajectoryControlLabel('Loop', loop));

      const sync = document.createElement('input');
      sync.type = 'checkbox';
      sync.addEventListener('change', () => {
        const current = getTrajectoryInfoBySceneId(sceneId);
        if (!(current && current.enabled && current.traj)) return;
        focusTrajectoryInfoScene(current);
        setTrajectorySyncEnabled(current, !!sync.checked);
      });
      controls.appendChild(createTrajectoryControlLabel('Sync', sync));

      row.appendChild(controls);
      row.addEventListener('click', (event) => {
        if (event.target && /^(input|button|select|textarea)$/i.test(event.target.tagName || '')) return;
        const current = getTrajectoryInfoBySceneId(sceneId);
        focusTrajectoryInfoScene(current);
        syncTrajectoryControls();
      });
      const refs = {
        sceneId,
        row,
        nameEl: name,
        controls,
        playBtn: play,
        resetBtn: reset,
        frameReadout: readout,
        slider,
        fpsInput: fps,
        loopCheckbox: loop,
        syncCheckbox: sync,
        syncedLabel,
      };
      trajectorySceneRowRefs.set(sceneId, refs);
      updateTrajectorySceneRow(refs, info, getActiveTrajectoryInfo());
      return row;
    }

    function updateTrajectorySceneRow(refs, info, activeInfo) {
      if (!(refs && info && info.enabled && info.traj)) return;
      const isFocused = !!(activeInfo && activeInfo.enabled && getTrajectoryInfoKey(activeInfo) === getTrajectoryInfoKey(info));
      const syncLocked = !!info.traj.syncEnabled;
      const recordingLocked = isRecording();
      const controlsLocked = syncLocked || recordingLocked;
      refs.row.classList.toggle('is-focused', isFocused);
      refs.row.classList.toggle('is-sync-disabled', syncLocked);
      refs.controls.classList.toggle('is-sync-disabled', syncLocked);
      setElementTextPreservingNode(refs.nameEl, String(info.scene && info.scene.name || info.record && info.record.name || 'Trajectory'));
      refs.syncedLabel.hidden = !syncLocked;
      setTrajectoryMiniButtonGlyph(refs.playBtn, info.traj.playing ? 'pause' : 'play_arrow');
      refs.playBtn.setAttribute('aria-label', info.traj.playing ? 'Pause trajectory' : 'Play trajectory');
      setTrajectorySyncDisabledClass(refs.playBtn, controlsLocked);
      setTrajectorySyncDisabledClass(refs.resetBtn, controlsLocked);
      setElementTextPreservingNode(refs.frameReadout, `${(info.traj.frameIndex | 0) + 1}/${info.frameCount}`);
      refs.slider.max = String(Math.max(0, info.frameCount - 1));
      setInputValueIfIdle(refs.slider, info.traj.frameIndex | 0);
      setTrajectorySyncDisabledClass(refs.slider, controlsLocked);
      setInputValueIfIdle(refs.fpsInput, info.traj.fps);
      setTrajectorySyncDisabledClass(refs.fpsInput, controlsLocked);
      refs.loopCheckbox.checked = info.traj.loop !== false;
      refs.loopCheckbox.disabled = recordingLocked;
      refs.syncCheckbox.checked = !!info.traj.syncEnabled;
      refs.syncCheckbox.disabled = recordingLocked;
    }

    function buildTrajectorySyncMaster() {
      if (!trajectorySyncMasterEl) return null;
      trajectorySyncMasterEl.textContent = '';
      const title = document.createElement('div');
      title.className = 'trajectorySceneTitle';
      title.textContent = 'Sync master';
      trajectorySyncMasterEl.appendChild(title);

      const controls = document.createElement('div');
      controls.className = 'trajectoryMasterControls';
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'trajectoryMiniButton';
      play.addEventListener('click', () => {
        const master = getTrajectorySyncMaster();
        master.playing = !master.playing;
        master.lastStepMs = 0;
        syncTrajectoryControls();
      });
      controls.appendChild(play);

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'trajectoryMiniButton';
      setTrajectoryMiniButtonGlyph(reset, 'replay');
      reset.setAttribute('aria-label', 'Reset master clock to first frame');
      reset.addEventListener('click', () => {
        const master = getTrajectorySyncMaster();
        master.frame = 0;
        master.lastStepMs = 0;
        applyMasterFrameToSyncedTrajectories(getAllTrajectoryInfos(), { syncUi: true });
      });
      controls.appendChild(reset);

      const readout = document.createElement('span');
      readout.className = 'trajectoryMasterReadout';
      controls.appendChild(readout);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.step = '1';
      armRangeInputInteractionTracking(slider);
      slider.addEventListener('input', () => {
        const infos = getAllTrajectoryInfos();
        const master = getTrajectorySyncMaster();
        const maxFrames = getTrajectoryMasterMaxFrames(infos);
        master.frame = maxFrames > 0 ? (Math.max(0, Number(slider.value) | 0) % maxFrames) : 0;
        master.lastStepMs = 0;
        applyMasterFrameToSyncedTrajectories(infos, { syncUi: true });
      });
      controls.appendChild(slider);

      const fps = document.createElement('input');
      fps.type = 'number';
      fps.min = '1';
      fps.max = '120';
      fps.step = '1';
      fps.addEventListener('change', () => {
        const master = getTrajectorySyncMaster();
        master.fps = Math.max(1, Math.min(120, Math.round(Number(fps.value) || 12)));
        master.lastStepMs = 0;
        syncTrajectoryControls();
      });
      controls.appendChild(createTrajectoryControlLabel('FPS', fps));
      trajectorySyncMasterEl.appendChild(controls);
      trajectoryMasterRefs = {
        row: trajectorySyncMasterEl,
        playBtn: play,
        resetBtn: reset,
        frameReadout: readout,
        slider,
        fpsInput: fps,
      };
      return trajectoryMasterRefs;
    }

    function updateTrajectorySyncMaster(infos) {
      if (!trajectoryMasterRefs) return;
      const master = getTrajectorySyncMaster();
      const maxFrames = getTrajectoryMasterMaxFrames(infos);
      normalizeTrajectoryMasterFrame(infos);
      trajectoryMasterRefs.row.hidden = false;
      setTrajectoryMiniButtonGlyph(trajectoryMasterRefs.playBtn, master.playing ? 'pause' : 'play_arrow');
      trajectoryMasterRefs.playBtn.setAttribute('aria-label', master.playing ? 'Pause synchronized trajectories' : 'Play synchronized trajectories');
      const recording = isRecording();
      trajectoryMasterRefs.playBtn.disabled = recording;
      trajectoryMasterRefs.resetBtn.disabled = recording;
      setElementTextPreservingNode(trajectoryMasterRefs.frameReadout, `frame ${master.frame}`);
      trajectoryMasterRefs.slider.max = String(Math.max(0, maxFrames - 1));
      setInputValueIfIdle(trajectoryMasterRefs.slider, master.frame);
      trajectoryMasterRefs.slider.disabled = recording;
      setInputValueIfIdle(trajectoryMasterRefs.fpsInput, master.fps);
      trajectoryMasterRefs.fpsInput.disabled = recording;
    }

    function getTrajectoryPopoverStructureKey(infos) {
      return (Array.isArray(infos) ? infos : []).map((info) => getTrajectoryInfoKey(info)).join('|');
    }

    function rebuildTrajectoryPopoverRows(infos) {
      trajectorySceneRowRefs.clear();
      if (trajectorySceneListEl) {
        trajectorySceneListEl.textContent = '';
        for (const info of infos) trajectorySceneListEl.appendChild(buildTrajectorySceneRow(info));
      }
      trajectoryPopoverStructureKey = getTrajectoryPopoverStructureKey(infos);
    }

    function syncTrajectoryMasterStructure(hasSync) {
      if (trajectorySyncMasterEl) {
        if (hasSync && !trajectoryMasterRefs) {
          trajectorySyncMasterEl.hidden = false;
          buildTrajectorySyncMaster();
        } else if (!hasSync && trajectoryMasterRefs) {
          trajectoryMasterRefs = null;
          trajectorySyncMasterEl.hidden = true;
          trajectorySyncMasterEl.textContent = '';
        } else {
          trajectorySyncMasterEl.hidden = !hasSync;
        }
      }
    }

    function updateTrajectoryPopoverValues(infos, activeInfo) {
      for (const info of infos) {
        const refs = trajectorySceneRowRefs.get(getTrajectoryInfoKey(info));
        if (refs) updateTrajectorySceneRow(refs, info, activeInfo);
      }
      if (anyTrajectorySyncEnabled(infos)) updateTrajectorySyncMaster(infos);
    }

    function reset() {
      if (trajectorySceneListEl) trajectorySceneListEl.textContent = '';
      if (trajectorySyncMasterEl) { trajectorySyncMasterEl.hidden = true; trajectorySyncMasterEl.textContent = ''; }
      trajectorySceneRowRefs.clear();
      trajectoryMasterRefs = null;
      trajectoryPopoverStructureKey = '';
    }
    function sync(infos, activeInfo) {
      if (getTrajectoryPopoverStructureKey(infos) !== trajectoryPopoverStructureKey) rebuildTrajectoryPopoverRows(infos);
      syncTrajectoryMasterStructure(anyTrajectorySyncEnabled(infos));
      updateTrajectoryPopoverValues(infos, activeInfo);
    }
    return Object.freeze({ reset, sync, setInputValueIfIdle });
  }
  global.VibeMolTrajectoryUi = Object.freeze({ createTrajectoryUi });
})(typeof window !== 'undefined' ? window : globalThis);
