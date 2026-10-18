(function (global) {
  'use strict';

  // The record/master objects remain the authoritative clocks. This controller
  // owns their policy; rendering, panels and shared video export stay with app.
  function createTrajectoryPlaybackController(deps) {
    const {
      getSceneGraphController,
      getActiveRecord,
      TrajectoryClock,
      applyAtomCoordinateFrame,
      markSessionChanged,
      isEditMode,
      syncTrajectoryControls,
      getVideoController,
    } = deps;
    // Retain the clock owner only until last-record cleanup. Never duplicate
    // its playing flag or timestamp; a removed independent record still owns
    // the live clock that tells the empty-scene tick to clear master/UI state.
    let lastPlaybackOwner = null;

    function observePlaybackOwner(info, master = null) {
      lastPlaybackOwner = info && info.enabled && info.traj
        ? (info.traj.syncEnabled ? (master || getTrajectorySyncMaster()) : info.traj)
        : null;
    }

    function forgetPlaybackOwner() {
      lastPlaybackOwner = null;
    }

    function getTrajectorySyncMaster() {
      const state = getSceneGraphController() && getSceneGraphController().getState ? getSceneGraphController().getState() : null;
      if (!state) return { playing: false, frame: 0, fps: 12, lastStepMs: 0 };
      if (!state.syncMaster) state.syncMaster = {};
      const master = state.syncMaster;
      master.playing = !!master.playing;
      master.frame = Math.max(0, Math.floor(Number(master.frame) || 0));
      master.fps = Math.max(1, Math.min(120, Math.round(Number(master.fps) || 12)));
      master.lastStepMs = Math.max(0, Number(master.lastStepMs) || 0);
      return master;
    }

    function normalizeTrajectoryClock(traj, frameCount) {
      return traj ? Object.assign(traj, TrajectoryClock.normalize(traj, frameCount)) : null;
    }

    function getTrajectoryInfoForRecord(record, scene = null) {
      const vol = record && record.vol;
      const atomCount = (vol && Array.isArray(vol.atoms)) ? vol.atoms.length : 0;
      const traj = vol && vol.trajectory;
      if (!traj || !Array.isArray(traj.frames) || traj.frames.length <= 1 || atomCount <= 0) {
        return { enabled: false, scene, record, vol, traj: null, atomCount, frameCount: 0 };
      }
      const frameSize = atomCount * 3;
      const valid = traj.frames.every((frame) => frame && frame.length === frameSize);
      if (!valid) return { enabled: false, scene, record, vol, traj: null, atomCount, frameCount: 0 };
      normalizeTrajectoryClock(traj, traj.frames.length);
      if (scene && scene.kind === 'trajectory') {
        scene.trajectory = traj;
        scene.meta = Object.assign({}, scene.meta || {}, { frameCount: traj.frames.length });
      }
      return { enabled: true, scene, record, vol, traj, atomCount, frameCount: traj.frames.length };
    }

    function getTrajectoryRecordForScene(scene) {
      if (!scene) return null;
      const layers = getSceneGraphController().listLayers(scene);
      const trajectoryLayer = layers.find((layer) => layer && layer.record && getActiveTrajectoryInfoForRecord(layer.record).enabled);
      if (trajectoryLayer) return trajectoryLayer.record;
      if (scene.moleculeRecord && getActiveTrajectoryInfoForRecord(scene.moleculeRecord).enabled) return scene.moleculeRecord;
      return null;
    }

    function getTrajectoryInfoForScene(scene) {
      return getTrajectoryInfoForRecord(getTrajectoryRecordForScene(scene), scene);
    }

    function getAllTrajectoryInfos() {
      const out = [];
      for (const scene of getSceneGraphController().getScenes()) {
        const info = getTrajectoryInfoForScene(scene);
        if (info.enabled) out.push(info);
      }
      return out;
    }

    function getActiveTrajectoryInfo() {
      const focused = getSceneGraphController().getFocusedScene ? getSceneGraphController().getFocusedScene() : null;
      const focusedInfo = focused ? getTrajectoryInfoForScene(focused) : null;
      if (focusedInfo && focusedInfo.enabled) return focusedInfo;
      const activeRecord = getActiveRecord();
      const activeInfo = getTrajectoryInfoForRecord(activeRecord, null);
      if (activeInfo.enabled) return activeInfo;
      return getAllTrajectoryInfos()[0] || { enabled: false, scene: focused || null, record: activeRecord, vol: activeRecord && activeRecord.vol, traj: null, atomCount: 0, frameCount: 0 };
    }

    function shouldUseDynamicTrajectoryBondsForVolume(vol) {
      if (isEditMode()) return false;
      return isTrajectoryVolumeRecord(vol);
    }

    function getTrajectoryInfoBySceneId(sceneId) {
      const id = String(sceneId || '');
      return getAllTrajectoryInfos().find((info) => String(info && info.scene && info.scene.id || '') === id) || null;
    }

    function getTrajectoryMasterMaxFrames(infos = getAllTrajectoryInfos()) {
      const synced = (Array.isArray(infos) ? infos : []).filter((info) => info && info.traj && info.traj.syncEnabled);
      return Math.max(1, ...synced.map((info) => Math.max(1, Number(info.frameCount) | 0)));
    }

    function normalizeTrajectoryMasterFrame(infos = getAllTrajectoryInfos()) {
      const master = getTrajectorySyncMaster();
      const maxFrames = getTrajectoryMasterMaxFrames(infos);
      master.frame = maxFrames > 0 ? (Math.max(0, Math.floor(Number(master.frame) || 0)) % maxFrames) : 0;
      return master.frame;
    }

    function applyMasterFrameToSyncedTrajectories(infos = getAllTrajectoryInfos(), options = {}) {
      const master = getTrajectorySyncMaster();
      normalizeTrajectoryMasterFrame(infos);
      for (const info of infos) {
        if (info && info.traj && info.traj.syncEnabled) {
          applyTrajectoryFrameForInfo(info, mapMasterFrameToTrajectory(info, master.frame), { syncUi: false });
        }
      }
      if (options.syncUi !== false) syncTrajectoryControls();
    }

    function applyTrajectoryFrameForInfo(info, frameIndex, options = {}) {
      if (!info.enabled) return false;
      const syncUi = options.syncUi !== false;
      const traj = info.traj;
      const frame = traj.frames[Math.max(0, Math.min(info.frameCount - 1, Number(frameIndex) | 0))];
      if (!frame) return false;
      const nextIndex = Math.max(0, Math.min(info.frameCount - 1, Number(frameIndex) | 0));
      traj.frameIndex = nextIndex;
      traj.currentFrame = nextIndex;
      applyAtomCoordinateFrame(info.vol, frame, info.atomCount, { record: info.record });
      markSessionChanged();
      if (syncUi) syncTrajectoryControls();
      return true;
    }

    function applyTrajectoryFrame(frameIndex, options = {}) {
      return applyTrajectoryFrameForInfo(getActiveTrajectoryInfo(), frameIndex, options);
    }

    function mapMasterFrameToTrajectory(info, masterFrame = getTrajectorySyncMaster().frame) {
      return info && info.enabled
        ? TrajectoryClock.mapFrame(masterFrame, info.frameCount, info.traj && info.traj.loop !== false)
        : 0;
    }

    function anyTrajectorySyncEnabled(infos = getAllTrajectoryInfos()) {
      return infos.some((info) => info && info.enabled && info.traj && info.traj.syncEnabled);
    }

    function stopAllTrajectoryPlayback(options = {}) {
      for (const info of getAllTrajectoryInfos()) {
        if (info.traj) {
          info.traj.playing = false;
          info.traj._lastStepMs = 0;
        }
      }
      const master = getTrajectorySyncMaster();
      master.playing = false;
      master.lastStepMs = 0;
      forgetPlaybackOwner();
      if (options.syncUi !== false) syncTrajectoryControls();
    }

    function setAllTrajectoryPlayback(playing, options = {}) {
      const infos = getAllTrajectoryInfos();
      const nextPlaying = !!playing;
      const master = getTrajectorySyncMaster();
      let hasSynced = false;
      for (const info of infos) {
        if (!(info && info.traj)) continue;
        if (info.traj.syncEnabled) {
          hasSynced = true;
          info.traj.playing = false;
        } else {
          info.traj.playing = nextPlaying;
          info.traj._lastStepMs = 0;
        }
      }
      master.playing = hasSynced ? nextPlaying : false;
      master.lastStepMs = 0;
      const active = getActiveTrajectoryInfo();
      observePlaybackOwner(active, master);
      if (options.syncUi !== false) syncTrajectoryControls();
    }

    function resetAllTrajectoryFrames(options = {}) {
      const infos = getAllTrajectoryInfos();
      const master = getTrajectorySyncMaster();
      master.frame = 0;
      master.lastStepMs = 0;
      for (const info of infos) {
        if (!(info && info.traj)) continue;
        info.traj._lastStepMs = 0;
        applyTrajectoryFrameForInfo(info, 0, { syncUi: false });
      }
      if (options.syncUi !== false) syncTrajectoryControls();
    }

    function isAnyTrajectoryPlaybackActive() {
      if (getTrajectorySyncMaster().playing && anyTrajectorySyncEnabled()) return true;
      return getAllTrajectoryInfos().some((info) => !!(info && info.traj && info.traj.playing));
    }

    function setTrajectorySyncEnabled(info, enabled) {
      if (!(info && info.enabled && info.traj)) return false;
      const infos = getAllTrajectoryInfos();
      const master = getTrajectorySyncMaster();
      const wasFirstSync = !infos.some((item) => item !== info && item.traj && item.traj.syncEnabled);
      const nextEnabled = !!enabled;
      if (nextEnabled) {
        if (!info.traj.syncEnabled && wasFirstSync) {
          master.frame = Math.max(0, Number(info.traj.frameIndex) | 0);
          master.fps = Math.max(1, Math.min(120, Math.round(Number(info.traj.fps) || master.fps || 12)));
          master.lastStepMs = 0;
        }
        info.traj._preSyncPlaying = !!info.traj.playing;
        info.traj.playing = false;
        info.traj._lastStepMs = 0;
        info.traj.syncEnabled = true;
        applyTrajectoryFrameForInfo(info, mapMasterFrameToTrajectory(info, master.frame), { syncUi: false });
      } else {
        const mapped = mapMasterFrameToTrajectory(info, master.frame);
        info.traj.syncEnabled = false;
        info.traj.playing = false;
        info.traj._lastStepMs = 0;
        applyTrajectoryFrameForInfo(info, mapped, { syncUi: false });
        if (!anyTrajectorySyncEnabled()) {
          master.playing = false;
          master.lastStepMs = 0;
        }
      }
      normalizeTrajectoryMasterFrame(getAllTrajectoryInfos());
      syncTrajectoryControls();
      return true;
    }

    function updateTrajectoryPlayback(nowMs) {
      const infos = getAllTrajectoryInfos();
      if (!infos.length) {
        const previousOwner = lastPlaybackOwner;
        forgetPlaybackOwner();
        if ((previousOwner && previousOwner.playing) || getTrajectorySyncMaster().playing) stopAllTrajectoryPlayback({ syncUi: true });
        return;
      }
      if (isEditMode()) return;

      let advanced = false;
      const master = getTrajectorySyncMaster();
      const masterTick = TrajectoryClock.advance({
        frame: master.frame, playing: master.playing && anyTrajectorySyncEnabled(infos),
        fps: master.fps, loop: true, lastStepMs: master.lastStepMs,
      }, getTrajectoryMasterMaxFrames(infos), nowMs);
      master.frame = masterTick.frame;
      master.lastStepMs = masterTick.lastStepMs;
      advanced = masterTick.advanced;

      for (const info of infos) {
        const traj = info.traj;
        if (!traj) continue;
        if (traj.syncEnabled) {
          const mapped = mapMasterFrameToTrajectory(info, master.frame);
          const lastFrameIndex = info.frameCount - 1;
          const exportAdvance = (getVideoController() && getVideoController().getTargetRecord && getVideoController().getTargetRecord() === info.record)
            ? getVideoController().resolveAdvance(mapped, lastFrameIndex)
            : null;
          if (exportAdvance && exportAdvance.stopPlayback) {
            master.playing = false;
            master.lastStepMs = 0;
          }
          if ((traj.frameIndex | 0) !== mapped || advanced) {
            applyTrajectoryFrameForInfo(info, mapped, { syncUi: false });
            advanced = true;
          }
          continue;
        }
        const tick = TrajectoryClock.advance({
          frame: traj.frameIndex, playing: traj.playing, fps: traj.fps,
          loop: traj.loop, lastStepMs: traj._lastStepMs,
        }, info.frameCount, nowMs);
        traj._lastStepMs = tick.lastStepMs;
        if (!tick.advanced) continue;
        let next = tick.rawFrame;
        const lastFrameIndex = info.frameCount - 1;
        const exportAdvance = (getVideoController() && getVideoController().getTargetRecord && getVideoController().getTargetRecord() === info.record)
          ? getVideoController().resolveAdvance(next, lastFrameIndex)
          : null;
        if (exportAdvance && Object.prototype.hasOwnProperty.call(exportAdvance, 'nextFrameIndex')) {
          next = Number(exportAdvance.nextFrameIndex) | 0;
        }
        if (exportAdvance && exportAdvance.stopPlayback) {
          traj.playing = false;
          traj._lastStepMs = 0;
        } else if (next >= info.frameCount) {
          if (traj.loop) next = next % info.frameCount;
          else {
            next = lastFrameIndex;
            traj.playing = false;
            traj._lastStepMs = 0;
          }
        }
        applyTrajectoryFrameForInfo(info, next, { syncUi: false });
        advanced = true;
      }
      const active = getActiveTrajectoryInfo();
      observePlaybackOwner(active, master);
      if (advanced) syncTrajectoryControls();
    }

    function setTrajectoryPlayingForInfo(info, playing) {
      if (!(info && info.enabled && info.traj)) return false;
      if (info.traj.syncEnabled) {
        const master = getTrajectorySyncMaster();
        master.playing = !!playing;
        master.lastStepMs = 0;
      } else {
        info.traj.playing = !!playing;
        info.traj._lastStepMs = 0;
      }
      const active = getActiveTrajectoryInfo();
      observePlaybackOwner(active);
      syncTrajectoryControls();
      return true;
    }

    function stopTrajectoryPlayback(options = {}) {
      const info = getActiveTrajectoryInfo();
      if (info.enabled && info.traj) {
        if (info.traj.syncEnabled) {
          const master = getTrajectorySyncMaster();
          master.playing = false;
          master.lastStepMs = 0;
        } else {
          info.traj.playing = false;
          info.traj._lastStepMs = 0;
        }
      }
      forgetPlaybackOwner();
      if (options.syncUi !== false) syncTrajectoryControls();
    }

    function isTrajectoryVolumeRecord(vol) {
      const frames = vol && vol.trajectory && vol.trajectory.frames;
      return Array.isArray(frames) && frames.length > 1;
    }

    function getActiveTrajectoryInfoForRecord(record) {
      if (!record || !record.vol) return { enabled: false };
      const frames = record.vol.trajectory && record.vol.trajectory.frames;
      return { enabled: Array.isArray(frames) && frames.length > 1, frameCount: Array.isArray(frames) ? frames.length : 0 };
    }

    function cloneTrajectoryState(traj) {
      if (!traj || !Array.isArray(traj.frames)) return null;
      return {
        frames: traj.frames.map((frame) => new Float32Array(frame)),
        comments: Array.isArray(traj.comments) ? traj.comments.slice() : [],
        frameIndex: Number.isFinite(Number(traj.frameIndex)) ? Number(traj.frameIndex) | 0 : 0,
        currentFrame: Number.isFinite(Number(traj.currentFrame)) ? Number(traj.currentFrame) | 0 : (Number.isFinite(Number(traj.frameIndex)) ? Number(traj.frameIndex) | 0 : 0),
        playing: !!traj.playing,
        fps: Number.isFinite(Number(traj.fps)) ? Number(traj.fps) : 12,
        loop: traj.loop !== false,
        syncEnabled: !!traj.syncEnabled,
      };
    }

    return Object.freeze({
      getTrajectorySyncMaster,
      normalizeTrajectoryClock,
      getTrajectoryInfoForRecord,
      getTrajectoryRecordForScene,
      getTrajectoryInfoForScene,
      getAllTrajectoryInfos,
      getActiveTrajectoryInfo,
      shouldUseDynamicTrajectoryBondsForVolume,
      getTrajectoryInfoBySceneId,
      getTrajectoryMasterMaxFrames,
      normalizeTrajectoryMasterFrame,
      applyMasterFrameToSyncedTrajectories,
      applyTrajectoryFrameForInfo,
      applyTrajectoryFrame,
      mapMasterFrameToTrajectory,
      anyTrajectorySyncEnabled,
      stopAllTrajectoryPlayback,
      setAllTrajectoryPlayback,
      resetAllTrajectoryFrames,
      isAnyTrajectoryPlaybackActive,
      setTrajectorySyncEnabled,
      updateTrajectoryPlayback,
      setTrajectoryPlayingForInfo,
      stopTrajectoryPlayback,
      isTrajectoryVolumeRecord,
      getActiveTrajectoryInfoForRecord,
      cloneTrajectoryState,
      observePlaybackOwner,
      forgetPlaybackOwner,
    });
  }

  global.VibeMolTrajectoryPlayback = Object.freeze({ createTrajectoryPlaybackController });
})(typeof window !== 'undefined' ? window : globalThis);
