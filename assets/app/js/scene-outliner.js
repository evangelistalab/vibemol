(function (global) {
  'use strict';

  // Owns outliner rows, drag feedback, rename sessions, menus, and the combine form.
  // Scene mutations and numerical work are supplied by the model controllers.
  function createSceneOutliner(deps) {
    const {
      ArithmeticGrid,
      DEFAULT_ISO_VALUE,
      MODES,
      SCENE_LAYER_KIND,
      activateSceneFocusRecord,
      arithmeticConfigsEqual,
      arithmeticLayers,
      clearOutlinerSelectionToActive,
      copyCubeLayerAppearance,
      deleteSceneFromOutliner,
      deleteSelectedCubeLayers,
      duplicateCubeLayer,
      duplicateLayerBlockToScene,
      duplicateSelectedCubeLayers,
      focusScene,
      formatIsoInputValue,
      generateArithmeticName,
      getActiveCubeLayer,
      getArithmeticCascadeDeletePlan,
      getArithmeticNameUserEdited,
      getCircularOperandIdsForEdit,
      getCubeLayersInScene,
      getFocusedScene,
      getLayerSourceVolume,
      getLayerDisplayName,
      getLayerFullDisplayName,
      getLayerSurfaceColors,
      getNextCubeLabelId,
      getSceneActiveCubeLayer,
      getSceneMoleculeVolume,
      getSelectedCubeLayerIds,
      getSelectedCubeLayers,
      getSurfaceDefaultsForNewLayer,
      getTrajectoryInfoForScene,
      getVisibleCubeLayerCount,
      hasVolumetricGrid,
      isCubeLayerSelected,
      isCubeLikeLayer,
      moleculeMatchesVolume,
      moveLayerBlockToScene,
      normalizeArithmeticInputsForOperation,
      normalizeArithmeticOperation,
      rangeSelectCubeLayer,
      rebuildScene,
      resolveArithmeticInputs,
      sceneGraphController,
      sceneOutlinerAddBtn,
      sceneOutlinerBodyEl,
      setActiveSceneGraphLayer,
      setHintMessage,
      setOnlyCubeVisibleInScene,
      setSceneHeaderActive,
      syncAppearanceControlsToActiveLayer,
      syncLoadedSceneControls,
      syncTrajectoryControls,
      toggleCubeLayerSelection,
      updateSidePanel,
      validateArithmeticInputGrids,
      validateCrossSceneLayerMove,
      getCurrentMode,
      loadFiles,
    } = deps;

    let outlinerFlashLayerId = null;

    let outlinerFlashTimer = 0;

    let outlinerScrollTargetId = null;

    let outlinerScrollRaf = 0;

    let outlinerRenameState = null;

    let outlinerAddFileInputEl = null;

    let outlinerAddTargetSceneKey = '';

    let outlinerDragState = null;

    let outlinerDropIndicatorEl = null;

    let outlinerDragImageEl = null;

    let outlinerDragHighlightedRow = null;

    let cubeLayerContextMenuEl = null;

    let cubeLayerContextMenuLayerId = null;

    let cubeLayerContextMenuPoint = null;

    let combinePopoverEl = null;

    let combinePopoverState = null;

    function getOutlinerDragLayers() {
      if (!(outlinerDragState && Array.isArray(outlinerDragState.layerIds))) return [];
      return outlinerDragState.layerIds
        .map((id) => sceneGraphController.getLayerById(id))
        .filter(isCubeLikeLayer);
    }

    function getOrderedDragLayersForStart(layer) {
      if (!isCubeLikeLayer(layer)) return [];
      const scene = sceneGraphController.getSceneForLayer(layer);
      if (!scene) return [layer];
      if (!isCubeLayerSelected(layer)) return [layer];
      const selected = new Set(getSelectedCubeLayerIds());
      return getCubeLayersInScene(scene).filter((candidate) => selected.has(candidate.id));
    }

    function isOutlinerDragInteractiveTarget(event) {
      const target = event && event.target;
      return !!(target && typeof target.closest === 'function' && target.closest(
        '.vm-outliner-row__eye, .vm-outliner-row__twisty, .vm-outliner-row__rename-input, button, input, select, textarea, a, [role="button"]'
      ));
    }

    function ensureOutlinerDropIndicator() {
      if (outlinerDropIndicatorEl) return outlinerDropIndicatorEl;
      const indicator = document.createElement('div');
      indicator.className = 'vm-outliner-drop-indicator';
      indicator.hidden = true;
      document.body.appendChild(indicator);
      outlinerDropIndicatorEl = indicator;
      return indicator;
    }

    function hideOutlinerDropIndicator() {
      if (outlinerDropIndicatorEl) outlinerDropIndicatorEl.hidden = true;
    }

    function setOutlinerMergeHighlight(row, copyMode) {
      if (outlinerDragHighlightedRow && outlinerDragHighlightedRow !== row) {
        outlinerDragHighlightedRow.classList.remove('is-drag-merge-target', 'is-copy-target');
      }
      outlinerDragHighlightedRow = row || null;
      if (row) {
        row.classList.add('is-drag-merge-target');
        row.classList.toggle('is-copy-target', !!copyMode);
      }
    }

    function clearOutlinerDropFeedback() {
      hideOutlinerDropIndicator();
      setOutlinerMergeHighlight(null, false);
    }

    function clearOutlinerDragVisuals() {
      clearOutlinerDropFeedback();
      if (sceneOutlinerBodyEl) {
        for (const row of sceneOutlinerBodyEl.querySelectorAll('.vm-outliner-row.is-dragging')) {
          row.classList.remove('is-dragging');
        }
      }
      if (outlinerDragImageEl && outlinerDragImageEl.parentNode) {
        outlinerDragImageEl.parentNode.removeChild(outlinerDragImageEl);
      }
      outlinerDragImageEl = null;
    }

    function findOutlinerRowById(id) {
      const targetId = String(id || '');
      if (!sceneOutlinerBodyEl || !targetId) return null;
      return Array.from(sceneOutlinerBodyEl.querySelectorAll('.vm-outliner-row'))
        .find((row) => row && row.dataset && row.dataset.id === targetId) || null;
    }

    function scrollOutlinerTargetIntoView(id) {
      const row = findOutlinerRowById(id);
      if (!row) return false;
      row.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
      return true;
    }

    function scheduleOutlinerScrollToTarget(id) {
      outlinerScrollTargetId = id || null;
      if (!outlinerScrollTargetId || outlinerScrollRaf) return;
      outlinerScrollRaf = window.requestAnimationFrame(() => {
        outlinerScrollRaf = window.requestAnimationFrame(() => {
          const targetId = outlinerScrollTargetId;
          outlinerScrollRaf = 0;
          outlinerScrollTargetId = null;
          if (targetId) scrollOutlinerTargetIntoView(targetId);
        });
      });
    }

    function showOutlinerDropIndicator(row, before, copyMode) {
      if (!row) return;
      const indicator = ensureOutlinerDropIndicator();
      const rect = row.getBoundingClientRect();
      indicator.hidden = false;
      indicator.classList.toggle('is-copy', !!copyMode);
      indicator.style.left = `${Math.max(0, rect.left + 4)}px`;
      indicator.style.top = `${Math.max(0, before ? rect.top : rect.bottom)}px`;
      indicator.style.width = `${Math.max(12, rect.width - 8)}px`;
    }

    function createOutlinerDragImage(layers) {
      const ghost = document.createElement('div');
      ghost.className = 'vm-outliner-drag-ghost';
      const first = layers && layers[0];
      ghost.textContent = first ? getLayerFullDisplayName(first) : 'Layer';
      if (layers.length > 1) {
        const badge = document.createElement('span');
        badge.className = 'vm-outliner-drag-ghost__badge';
        badge.textContent = `+${layers.length - 1}`;
        ghost.appendChild(badge);
      }
      document.body.appendChild(ghost);
      outlinerDragImageEl = ghost;
      return ghost;
    }

    function getOutlinerDropCandidate(target, row, event) {
      if (!outlinerDragState) return { kind: 'invalid', valid: false };
      const sourceScene = sceneGraphController.findScene(outlinerDragState.sourceSceneId);
      const layers = getOutlinerDragLayers();
      if (!(sourceScene && layers.length && target)) return { kind: 'invalid', valid: false };
      if (target.type === 'scene') {
        const destinationScene = target.scene;
        if (!destinationScene || destinationScene.id === sourceScene.id) {
          return { kind: 'noop', valid: false, scene: destinationScene || null };
        }
        const sourceVol = getSceneMoleculeVolume(sourceScene);
        const destinationVol = getSceneMoleculeVolume(destinationScene);
        if (!moleculeMatchesVolume(sourceVol, destinationVol)) {
          return {
            kind: 'merge',
            valid: false,
            scene: destinationScene,
            error: 'Cannot merge: molecules don\'t match',
          };
        }
        const arithmeticCheck = validateCrossSceneLayerMove(layers, sourceScene, { copyMode: !!(event && event.shiftKey) });
        if (!arithmeticCheck.ok) {
          return {
            kind: 'merge',
            valid: false,
            scene: destinationScene,
            error: arithmeticCheck.error,
          };
        }
        return {
          kind: 'merge',
          valid: true,
          scene: destinationScene,
          index: getCubeLayersInScene(destinationScene).length,
        };
      }
      if (target.layer && isCubeLikeLayer(target.layer)) {
        const destinationScene = target.scene || sceneGraphController.getSceneForLayer(target.layer);
        if (!(destinationScene && destinationScene.id === sourceScene.id)) return { kind: 'invalid', valid: false };
        const cubeLayers = getCubeLayersInScene(destinationScene);
        const rowIndex = cubeLayers.findIndex((layer) => layer.id === target.layer.id);
        if (rowIndex < 0) return { kind: 'invalid', valid: false };
        const rect = row && row.getBoundingClientRect ? row.getBoundingClientRect() : { top: 0, height: 1 };
        const before = Number(event && event.clientY) < rect.top + rect.height / 2;
        return {
          kind: 'reorder',
          valid: true,
          scene: destinationScene,
          index: before ? rowIndex : rowIndex + 1,
          before,
        };
      }
      return { kind: 'invalid', valid: false };
    }

    function adjustReorderIndexForMove(scene, layers, index) {
      const movingIds = new Set((Array.isArray(layers) ? layers : []).map((layer) => layer.id));
      let adjusted = Math.max(0, Number(index) || 0);
      getCubeLayersInScene(scene).forEach((layer, layerIndex) => {
        if (movingIds.has(layer.id) && layerIndex < index) adjusted -= 1;
      });
      return Math.max(0, adjusted);
    }

    function finishOutlinerDragDrop(candidate, event) {
      const sourceScene = sceneGraphController.findScene(outlinerDragState && outlinerDragState.sourceSceneId);
      const layers = getOutlinerDragLayers();
      if (!(sourceScene && layers.length && candidate && candidate.valid)) return false;
      const copyMode = !!(event && event.shiftKey);
      const destinationScene = candidate.scene || sourceScene;
      const destinationWasSingle = getVisibleCubeLayerCount(destinationScene) <= 1;
      let nextLayers = [];
      if (copyMode) {
        nextLayers = duplicateLayerBlockToScene(layers, destinationScene, candidate.index);
      } else if (candidate.kind === 'reorder') {
        nextLayers = moveLayerBlockToScene(layers, sourceScene, destinationScene, adjustReorderIndexForMove(destinationScene, layers, candidate.index));
      } else if (candidate.kind === 'merge') {
        nextLayers = moveLayerBlockToScene(layers, sourceScene, destinationScene, candidate.index);
      }
      if (!nextLayers.length) return false;
      const active = nextLayers[0];
      const shouldSoloDestination = copyMode || candidate.kind === 'merge';
      focusScene(destinationScene);
      setActiveSceneGraphLayer(active.id, {
        forceSingleCubeVisibility: destinationWasSingle,
        ensureSceneVisible: true,
        ensureLayerVisible: true,
        expandPath: true,
        soloScene: shouldSoloDestination,
        rebuild: false,
        rebind: false,
        selection: 'replace',
      });
      flashOutlinerLayer(active.id);
      rebuildScene({ preserveView: true, syncGraph: false });
      syncLoadedSceneControls();
      syncTrajectoryControls();
      syncAppearanceControlsToActiveLayer();
      renderSceneOutliner();
      const verb = copyMode ? 'Copied' : (candidate.kind === 'merge' ? 'Moved' : 'Reordered');
      setHintMessage(`${verb} ${nextLayers.length === 1 ? getLayerDisplayName(active) : `${nextLayers.length} layers`}.`);
      return true;
    }

    function handleOutlinerDragStart(target, row, event) {
      if (outlinerRenameState || !(target && isCubeLikeLayer(target.layer)) || isOutlinerDragInteractiveTarget(event)) {
        event.preventDefault();
        return;
      }
      const scene = sceneGraphController.getSceneForLayer(target.layer);
      if (!scene) {
        event.preventDefault();
        return;
      }
      closeCubeLayerContextMenu();
      const layers = getOrderedDragLayersForStart(target.layer);
      if (!layers.length) {
        event.preventDefault();
        return;
      }
      outlinerDragState = {
        sourceSceneId: scene.id,
        layerIds: layers.map((layer) => layer.id),
        primaryLayerId: target.layer.id,
      };
      row.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', layers.map(getLayerFullDisplayName).join(', '));
      const ghost = createOutlinerDragImage(layers);
      if (event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(ghost, 12, 12);
    }

    function handleOutlinerDragOver(target, row, event) {
      if (!outlinerDragState) return;
      event.stopPropagation();
      const candidate = getOutlinerDropCandidate(target, row, event);
      const copyMode = !!event.shiftKey;
      clearOutlinerDropFeedback();
      if (candidate.kind === 'reorder' && candidate.valid) {
        event.preventDefault();
        event.dataTransfer.dropEffect = copyMode ? 'copy' : 'move';
        showOutlinerDropIndicator(row, candidate.before, copyMode);
        return;
      }
      if (candidate.kind === 'merge') {
        event.preventDefault();
        event.dataTransfer.dropEffect = candidate.valid ? (copyMode ? 'copy' : 'move') : 'none';
        if (candidate.valid) setOutlinerMergeHighlight(row, copyMode);
        return;
      }
      event.dataTransfer.dropEffect = 'none';
    }

    function handleOutlinerDrop(target, row, event) {
      if (!outlinerDragState) return;
      event.preventDefault();
      event.stopPropagation();
      const candidate = getOutlinerDropCandidate(target, row, event);
      if (candidate.valid) {
        finishOutlinerDragDrop(candidate, event);
      } else if (candidate.error) {
        setHintMessage(candidate.error);
      }
      outlinerDragState = null;
      clearOutlinerDragVisuals();
    }

    function handleOutlinerDragEnd() {
      outlinerDragState = null;
      clearOutlinerDragVisuals();
    }

    function flashOutlinerLayer(layerId, options = {}) {
      outlinerFlashLayerId = layerId || null;
      if (options.scroll !== false) scheduleOutlinerScrollToTarget(layerId);
      if (outlinerFlashTimer) window.clearTimeout(outlinerFlashTimer);
      outlinerFlashTimer = window.setTimeout(() => {
        outlinerFlashTimer = 0;
        if (outlinerFlashLayerId === layerId) {
          outlinerFlashLayerId = null;
          renderSceneOutliner();
        }
      }, 900);
    }

    function formatOutlinerAtomCount(vol) {
      const n = Array.isArray(vol && vol.atoms) ? vol.atoms.length : 0;
      return `${n} atom${n === 1 ? '' : 's'}`;
    }

    function formatOutlinerMetaForScene(scene) {
      if (!scene) return '';
      if (scene.kind === 'trajectory') {
        const info = getTrajectoryInfoForScene(scene);
        const frameCount = Number(info && info.frameCount)
          || Number(scene.meta && scene.meta.frameCount)
          || Number(scene.trajectory && scene.trajectory.frames && scene.trajectory.frames.length)
          || 0;
        if (frameCount > 0) return `${frameCount} frames`;
      }
      const molecule = sceneGraphController.getLayerById(scene.moleculeLayerId);
      if (molecule && molecule.record) return formatOutlinerAtomCount(molecule.record.vol);
      return '';
    }

    function formatOutlinerMetaForLayer(scene, layer) {
      if (!layer) return '';
      if (layer.kind === SCENE_LAYER_KIND.MOLECULE) return formatOutlinerAtomCount(layer.record && layer.record.vol);
      if (layer.kind === SCENE_LAYER_KIND.ORBITALS_GROUP) {
        const count = sceneGraphController.listLayers(scene).filter((item) => item.parentId === layer.id).length;
        return `${count} layer${count === 1 ? '' : 's'}`;
      }
      if (isCubeLikeLayer(layer)) {
        if (layer.kind === SCENE_LAYER_KIND.ARITHMETIC && layer.cubeDataValid === false) return '(invalid)';
        return `iso ${formatIsoInputValue(layer.iso || DEFAULT_ISO_VALUE)}`;
      }
      if (layer.kind === SCENE_LAYER_KIND.MEASUREMENTS_GROUP) {
        const count = sceneGraphController.listLayers(scene).filter((item) => item.parentId === layer.id).length;
        return `${count} item${count === 1 ? '' : 's'}`;
      }
      return '';
    }

    function getLayerIconName(layer) {
      if (!layer) return 'layers';
      if (layer.kind === SCENE_LAYER_KIND.MOLECULE) return 'hub';
      if (layer.kind === SCENE_LAYER_KIND.ORBITALS_GROUP) return 'blur_on';
      if (layer.kind === SCENE_LAYER_KIND.ARITHMETIC) return 'add';
      if (layer.kind === SCENE_LAYER_KIND.MEASUREMENTS_GROUP) return 'straighten';
      if (layer.kind === SCENE_LAYER_KIND.MEASUREMENT) return 'linear_scale';
      return '';
    }

    function getOutlinerRowTarget(options = {}) {
      if (options.scene) return { type: 'scene', id: options.scene.id, scene: options.scene, layer: null };
      if (options.layer) {
        const scene = sceneGraphController.getSceneForLayer(options.layer);
        return { type: 'layer', id: options.layer.id, scene, layer: options.layer };
      }
      return { type: '', id: '', scene: null, layer: null };
    }

    function isOutlinerTargetRenameable(target) {
      if (!target) return false;
      if (target.type === 'scene') return true;
      const layer = target.layer;
      return !!(layer && (
        isCubeLikeLayer(layer)
        || layer.kind === SCENE_LAYER_KIND.MOLECULE
      ));
    }

    function isOutlinerTargetBeingRenamed(target) {
      return !!(outlinerRenameState && target && target.id && outlinerRenameState.id === target.id);
    }

    function focusOutlinerRenameInput() {
      if (!sceneOutlinerBodyEl) return;
      const input = sceneOutlinerBodyEl.querySelector('.vm-outliner-row__rename-input');
      if (!input) return;
      input.focus();
      input.select();
    }

    function startOutlinerRename(target) {
      if (!isOutlinerTargetRenameable(target)) return false;
      closeCubeLayerContextMenu();
      const name = target.type === 'scene'
        ? target.scene && target.scene.name
        : target.layer && target.layer.name;
      outlinerRenameState = {
        id: target.id,
        type: target.type,
        originalName: String(name || 'Untitled'),
      };
      renderSceneOutliner();
      window.requestAnimationFrame(focusOutlinerRenameInput);
      return true;
    }

    function finishOutlinerRename(options = {}) {
      if (!outlinerRenameState) return false;
      const state = outlinerRenameState;
      const input = sceneOutlinerBodyEl
        ? sceneOutlinerBodyEl.querySelector('.vm-outliner-row__rename-input')
        : null;
      const raw = input ? input.value : state.originalName;
      const nextName = String(raw || '').trim();
      outlinerRenameState = null;
      if (options.commit !== false && nextName) {
        sceneGraphController.rename(state.id, nextName);
        syncLoadedSceneControls();
        syncTrajectoryControls();
        updateSidePanel();
        syncAppearanceControlsToActiveLayer();
      }
      renderSceneOutliner();
      return true;
    }

    function cancelOutlinerRename() {
      return finishOutlinerRename({ commit: false });
    }

    function getOutlinerAddSceneKey(scene = getFocusedScene()) {
      return scene && scene.sceneKey ? String(scene.sceneKey) : '';
    }

    function ensureOutlinerAddFileInput() {
      if (outlinerAddFileInputEl) return outlinerAddFileInputEl;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.cube,.cub';
      input.multiple = true;
      input.hidden = true;
      input.setAttribute('aria-hidden', 'true');
      input.addEventListener('change', () => {
        const files = input.files ? Array.from(input.files) : [];
        const targetSceneKey = outlinerAddTargetSceneKey;
        input.value = '';
        outlinerAddTargetSceneKey = '';
        if (!files.length) return;
        void loadFiles(files, {
          sceneDispatch: true,
          targetSceneKey,
        });
      });
      document.body.appendChild(input);
      outlinerAddFileInputEl = input;
      return outlinerAddFileInputEl;
    }

    function openOutlinerAddCubeFilePicker(scene = getFocusedScene()) {
      closeCubeLayerContextMenu();
      outlinerAddTargetSceneKey = getOutlinerAddSceneKey(scene);
      ensureOutlinerAddFileInput().click();
    }

    function buildOutlinerRow(options = {}) {
      const target = getOutlinerRowTarget(options);
      const renaming = isOutlinerTargetBeingRenamed(target);
      const inheritedHidden = !!(options.visible && options.effectiveVisible === false);
      const row = document.createElement('div');
      row.className = 'vm-outliner-row';
      row.dataset.id = options.id || '';
      row.dataset.depth = String(options.depth || 0);
      row.style.setProperty('--vm-outliner-indent', `${Math.max(0, Number(options.depth) || 0) * 16}px`);
      row.setAttribute('role', 'treeitem');
      row.tabIndex = 0;
      row.setAttribute('aria-selected', (options.active || options.selected) ? 'true' : 'false');
      row.classList.toggle('is-active', !!options.active);
      row.classList.toggle('is-selected', !!options.selected);
      row.classList.toggle('is-hidden', !options.effectiveVisible);
      row.classList.toggle('is-hidden-inherited', inheritedHidden);
      row.classList.toggle('is-group', !!options.expandable);
      row.classList.toggle('is-flashing', !!(options.layer && options.layer.id === outlinerFlashLayerId));
      row.classList.toggle('is-invalid', !!(options.layer && options.layer.kind === SCENE_LAYER_KIND.ARITHMETIC && options.layer.cubeDataValid === false));
      if (!renaming && options.layer && isCubeLikeLayer(options.layer)) {
        row.draggable = true;
        row.setAttribute('aria-grabbed', 'false');
        row.addEventListener('dragstart', (event) => handleOutlinerDragStart(target, row, event));
        row.addEventListener('dragend', handleOutlinerDragEnd);
      }
      row.addEventListener('dragover', (event) => handleOutlinerDragOver(target, row, event));
      row.addEventListener('drop', (event) => handleOutlinerDrop(target, row, event));

      const twisty = document.createElement('span');
      twisty.className = 'vm-outliner-row__twisty material-symbols-rounded';
      twisty.draggable = false;
      twisty.textContent = options.expandable ? (options.expanded ? 'expand_more' : 'chevron_right') : '';
      twisty.classList.toggle('is-leaf', !options.expandable);
      if (options.expandable) {
        twisty.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (options.scene) options.scene.expanded = options.scene.expanded === false;
          else if (options.layer) options.layer.expanded = options.layer.expanded === false;
          renderSceneOutliner();
        });
      }
      row.appendChild(twisty);

      const eye = document.createElement('span');
      eye.className = 'vm-outliner-row__eye material-symbols-rounded';
      eye.draggable = false;
      eye.classList.toggle('is-off', !options.visible || inheritedHidden);
      eye.classList.toggle('is-inherited-hidden', inheritedHidden);
      eye.textContent = options.visible && !inheritedHidden ? 'visibility' : 'visibility_off';
      eye.setAttribute('role', 'button');
      const eyeLabel = inheritedHidden ? 'Hidden by parent' : (options.visible ? 'Hide' : 'Show');
      eye.setAttribute('aria-label', eyeLabel);
      eye.setAttribute('data-tooltip', eyeLabel);
      eye.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const scene = options.scene || (options.layer ? sceneGraphController.getSceneForLayer(options.layer) : null);
        const wasVisible = !!options.visible;
        sceneGraphController.toggleVisibility(options.id);
        if (options.layer && options.layer.kind === SCENE_LAYER_KIND.ORBITALS_GROUP && wasVisible === false) {
          const activeCube = getSceneActiveCubeLayer(scene);
          if (activeCube) setOnlyCubeVisibleInScene(scene, activeCube);
        }
        if (options.layer && options.layer.record) {
          options.layer.record._sceneGraphLayerState = Object.assign({}, options.layer.record._sceneGraphLayerState || {}, {
            visible: options.layer.visible !== false,
          });
        }
        rebuildScene({ preserveView: true, syncGraph: false });
        renderSceneOutliner();
      });
      row.appendChild(eye);

      const icon = document.createElement('span');
      icon.className = 'vm-outliner-row__icon';
      icon.draggable = false;
      if (options.layer && options.layer.kind === SCENE_LAYER_KIND.CUBE) {
        icon.classList.add('vm-outliner-row__cube-dot');
        const colors = getLayerSurfaceColors(options.layer);
        icon.style.setProperty('--vm-cube-dot', colors.pos);
        icon.style.setProperty('--vm-cube-dot-neg', colors.neg);
      } else {
        icon.classList.add('material-symbols-rounded');
        icon.textContent = options.scene ? 'draft' : getLayerIconName(options.layer);
      }
      row.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'vm-outliner-row__label';
      if (options.layer && isCubeLikeLayer(options.layer)) {
        const prefix = document.createElement('span');
        prefix.className = 'vm-outliner-row__prefix';
        prefix.textContent = options.layer.labelId || '';
        label.appendChild(prefix);
        label.appendChild(document.createTextNode(' '));
      }
      if (renaming) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'vm-outliner-row__rename-input';
        input.draggable = false;
        input.value = outlinerRenameState ? outlinerRenameState.originalName : (options.label || 'Untitled');
        input.setAttribute('aria-label', 'Rename');
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('dblclick', (event) => event.stopPropagation());
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancelOutlinerRename();
            return;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            event.stopPropagation();
            finishOutlinerRename({ commit: true });
          }
        });
        input.addEventListener('blur', () => {
          finishOutlinerRename({ commit: true });
        });
        label.appendChild(input);
      } else {
        label.appendChild(document.createTextNode(options.label || 'Untitled'));
        if (isOutlinerTargetRenameable(target)) {
          label.addEventListener('dblclick', (event) => {
            if (event.target && event.target.closest && event.target.closest('.vm-outliner-row__prefix')) return;
            event.preventDefault();
            event.stopPropagation();
            startOutlinerRename(target);
          });
        }
      }
      row.appendChild(label);

      const meta = document.createElement('span');
      meta.className = 'vm-outliner-row__meta';
      meta.textContent = options.meta || '';
      row.appendChild(meta);

      row.addEventListener('click', (event) => {
        if (outlinerRenameState) return;
        if (options.scene) {
          setSceneHeaderActive(options.scene);
          return;
        }
        if (!options.layer) return;
        if (!isCubeLikeLayer(options.layer)) {
          setActiveSceneGraphLayer(options.layer.id);
          return;
        }
        if (event.shiftKey) {
          const active = sceneGraphController.getActiveLayer();
          rangeSelectCubeLayer(isCubeLikeLayer(active) ? active.id : null, options.layer);
          return;
        }
        if (event.metaKey || event.ctrlKey) {
          toggleCubeLayerSelection(options.layer);
          return;
        }
        setActiveSceneGraphLayer(options.layer.id, { selection: 'replace' });
      });
      row.addEventListener('contextmenu', (event) => showOutlinerContextMenu(target, event));
      return row;
    }

    function renderSceneOutliner() {
      if (!sceneOutlinerBodyEl) return;
      // Keep an in-progress rename input mounted through redraws and flash timers.
      if (outlinerRenameState && sceneOutlinerBodyEl.querySelector('.vm-outliner-row__rename-input')) return;
      sceneOutlinerBodyEl.textContent = '';
      const scenes = sceneGraphController.getScenes();
      document.documentElement.setAttribute('data-vm-scene-empty', scenes.length ? 'false' : 'true');
      if (!scenes.length) {
        const empty = document.createElement('div');
        empty.className = 'vm-outliner__empty';
        empty.textContent = 'No file loaded. Drag and drop a .cube, .molden, or .xyz file, or click the open icon above to begin.';
        sceneOutlinerBodyEl.appendChild(empty);
        return;
      }
      const activeLayer = sceneGraphController.getActiveLayer();
      const focusedScene = getFocusedScene();
      for (const scene of scenes) {
        const sceneRow = buildOutlinerRow({
          id: scene.id,
          scene,
          label: scene.name,
          meta: formatOutlinerMetaForScene(scene),
          depth: 0,
          visible: scene.visible !== false,
          effectiveVisible: scene.visible !== false,
          expandable: true,
          expanded: scene.expanded !== false,
          active: !!(focusedScene && focusedScene.id === scene.id && !activeLayer),
        });
        sceneOutlinerBodyEl.appendChild(sceneRow);
        if (scene.expanded === false) continue;
        const layers = sceneGraphController.listLayers(scene);
        const roots = layers.filter((layer) => !layer.parentId);
        for (const layer of roots) {
          renderOutlinerLayer(scene, layer, 1, activeLayer);
        }
      }
    }

    function renderOutlinerLayer(scene, layer, depth, activeLayer) {
      if (!sceneOutlinerBodyEl || !layer) return;
      const children = sceneGraphController.listLayers(scene).filter((item) => item.parentId === layer.id);
      if (layer.kind === SCENE_LAYER_KIND.MEASUREMENTS_GROUP && children.length === 0) return;
      const row = buildOutlinerRow({
        id: layer.id,
        layer,
        label: layer.name,
        meta: formatOutlinerMetaForLayer(scene, layer),
        depth,
        visible: layer.visible !== false,
        effectiveVisible: sceneGraphController.isLayerEffectivelyVisible(layer),
        expandable: children.length > 0,
        expanded: layer.expanded !== false,
        active: !!(activeLayer && activeLayer.id === layer.id),
        selected: isCubeLikeLayer(layer) && isCubeLayerSelected(layer),
      });
      sceneOutlinerBodyEl.appendChild(row);
      if (children.length && layer.expanded !== false) {
        for (const child of children) renderOutlinerLayer(scene, child, depth + 1, activeLayer);
      }
    }

    function closeCubeLayerContextMenu() {
      if (!cubeLayerContextMenuEl) return;
      cubeLayerContextMenuEl.hidden = true;
      cubeLayerContextMenuEl.setAttribute('aria-hidden', 'true');
      cubeLayerContextMenuLayerId = null;
      cubeLayerContextMenuPoint = null;
    }

    function isFocusInsideOutliner() {
      const active = document.activeElement;
      return !!(active && typeof active.closest === 'function' && active.closest('#sceneOutliner'));
    }

    function showDeleteSelectedCubeLayersConfirmation(event = null) {
      const selection = getSelectedCubeLayers();
      const layer = (selection.length ? selection[selection.length - 1] : null) || getActiveCubeLayer();
      if (!layer) return false;
      cubeLayerContextMenuLayerId = layer.id;
      const menu = renderCubeLayerContextMenu(layer, 'confirm-delete');
      if (!menu) return false;
      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      if (event && Number.isFinite(Number(event.clientX)) && Number.isFinite(Number(event.clientY))) {
        positionCubeLayerContextMenu(event);
      } else {
        const row = Array.from(document.querySelectorAll('#sceneOutlinerBody .vm-outliner-row'))
          .find((candidate) => candidate && candidate.dataset && candidate.dataset.id === layer.id);
        const rect = row ? row.getBoundingClientRect() : null;
        positionCubeLayerContextMenu({
          clientX: rect ? rect.left + Math.min(120, rect.width) : (window.innerWidth || 240) / 2,
          clientY: rect ? rect.top + Math.min(18, rect.height) : (window.innerHeight || 160) / 2,
        });
      }
      return true;
    }

    function positionCubeLayerContextMenu(event) {
      if (!cubeLayerContextMenuEl) return;
      const gap = 8;
      const rect = cubeLayerContextMenuEl.getBoundingClientRect();
      const width = Math.max(1, rect.width || 180);
      const height = Math.max(1, rect.height || 110);
      const left = Math.min(
        Math.max(gap, Number(event && event.clientX) || gap),
        Math.max(gap, (window.innerWidth || 0) - width - gap)
      );
      const top = Math.min(
        Math.max(gap, Number(event && event.clientY) || gap),
        Math.max(gap, (window.innerHeight || 0) - height - gap)
      );
      cubeLayerContextMenuEl.style.left = `${Math.round(left)}px`;
      cubeLayerContextMenuEl.style.top = `${Math.round(top)}px`;
    }

    function ensureCubeLayerContextMenu() {
      if (cubeLayerContextMenuEl) return cubeLayerContextMenuEl;
      const menu = document.createElement('div');
      menu.className = 'vm-outliner-context-menu';
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
      menu.setAttribute('role', 'menu');
      document.body.appendChild(menu);
      cubeLayerContextMenuEl = menu;
      document.addEventListener('pointerdown', (event) => {
        if (!cubeLayerContextMenuEl || cubeLayerContextMenuEl.hidden) return;
        if (event.target && cubeLayerContextMenuEl.contains(event.target)) return;
        closeCubeLayerContextMenu();
      });
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeCubeLayerContextMenu();
      });
      window.addEventListener('resize', closeCubeLayerContextMenu);
      window.addEventListener('scroll', closeCubeLayerContextMenu, true);
      return cubeLayerContextMenuEl;
    }

    function closeCombinePopover() {
      if (combinePopoverState && combinePopoverState.abortController) combinePopoverState.abortController.abort();
      if (!combinePopoverEl) return;
      combinePopoverEl.hidden = true;
      combinePopoverEl.setAttribute('aria-hidden', 'true');
      combinePopoverState = null;
    }

    function positionCombinePopover(point) {
      if (!combinePopoverEl) return;
      const gap = 10;
      const rect = combinePopoverEl.getBoundingClientRect();
      const width = Math.max(1, rect.width || 360);
      const height = Math.max(1, rect.height || 360);
      const left = Math.min(
        Math.max(gap, Number(point && point.clientX) || gap),
        Math.max(gap, (window.innerWidth || 0) - width - gap)
      );
      const top = Math.min(
        Math.max(gap, Number(point && point.clientY) || gap),
        Math.max(gap, (window.innerHeight || 0) - height - gap)
      );
      combinePopoverEl.style.left = `${Math.round(left)}px`;
      combinePopoverEl.style.top = `${Math.round(top)}px`;
    }

    function ensureCombinePopover() {
      if (combinePopoverEl) return combinePopoverEl;
      const popover = document.createElement('div');
      popover.className = 'vm-combine-popover';
      popover.hidden = true;
      popover.setAttribute('aria-hidden', 'true');
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-label', 'Combine cube layers');
      document.body.appendChild(popover);
      combinePopoverEl = popover;
      document.addEventListener('pointerdown', (event) => {
        if (!combinePopoverEl || combinePopoverEl.hidden) return;
        if (event.target && combinePopoverEl.contains(event.target)) return;
        closeCombinePopover();
      });
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && combinePopoverEl && !combinePopoverEl.hidden) closeCombinePopover();
      });
      window.addEventListener('resize', closeCombinePopover);
      window.addEventListener('scroll', closeCombinePopover, true);
      return combinePopoverEl;
    }

    function getCombineOperandOptions(scene, state = combinePopoverState) {
      const circularIds = state && state.mode === 'edit'
        ? getCircularOperandIdsForEdit(scene, state.editingLayerId)
        : new Set();
      return getCubeLayersInScene(scene).filter((layer) => {
        const vol = getLayerSourceVolume(layer);
        const moldenOrbital = vol && vol.kind === 'molden' && vol.molden
          && Array.isArray(vol.molden.mos) && vol.molden.mos[layer.moldenMoIndex];
        return isCubeLikeLayer(layer)
          && layer.cubeDataValid !== false
          && (!!moldenOrbital || (hasVolumetricGrid(vol) && !!(vol && vol.data && vol.data.length)));
      }).map((layer) => ({
        layer,
        disabled: circularIds.has(layer.id),
        reason: circularIds.has(layer.id) ? 'circular' : '',
      }));
    }

    function getEligibleCombineOperandLayers(scene, state = combinePopoverState) {
      return getCombineOperandOptions(scene, state).filter((option) => !option.disabled).map((option) => option.layer);
    }

    function getDisabledCombineOperandIdSet(scene, state = combinePopoverState) {
      return new Set(getCombineOperandOptions(scene, state).filter((option) => option.disabled).map((option) => option.layer.id));
    }

    function getLayerLabelWithName(layer) {
      if (!layer) return 'Layer';
      return `${layer.labelId || 'L?'} — ${layer.name || 'Layer'}`;
    }

    function hasEligibleCombineOperands(scene, state = combinePopoverState) {
      return getEligibleCombineOperandLayers(scene, state).length > 0;
    }

    function getNoEligibleOperandsError(state = combinePopoverState) {
      return state && state.mode === 'edit'
        ? 'No eligible operands available - all other layers depend on this one.'
        : 'Choose at least one operand.';
    }

    function chooseDefaultCombineOperand(scene, state = combinePopoverState, usedIds = new Set()) {
      const eligible = getEligibleCombineOperandLayers(scene, state);
      return eligible.find((layer) => !usedIds.has(layer.id)) || eligible[0] || null;
    }

    function ensureCombineOperandRowsHaveChoices(state = combinePopoverState) {
      if (!state) return;
      const scene = sceneGraphController.findScene(state.sceneId);
      if (!scene) return;
      const eligible = getEligibleCombineOperandLayers(scene, state);
      if (!eligible.length) return;
      const validIds = new Set(getCombineOperandOptions(scene, state).map((option) => option.layer.id));
      for (const input of Array.isArray(state.operands) ? state.operands : []) {
        if (!input.layerId || !validIds.has(input.layerId)) input.layerId = eligible[0].id;
      }
    }

    function getCombineSaveButtonLabel(state = combinePopoverState) {
      return state && state.mode === 'edit' ? 'Save' : 'Create';
    }

    function getCombineTitle(state = combinePopoverState) {
      if (!(state && state.mode === 'edit')) return 'Combine';
      const layer = sceneGraphController.getLayerById(state.editingLayerId);
      return `Edit combination - ${layer && layer.labelId ? layer.labelId : 'layer'}`;
    }

    function getCombineNameTouched(state = combinePopoverState) {
      return !!(state && (state.nameTouched || state.nameUserEdited));
    }

    function getCombineOutputName(state = combinePopoverState, operands = null) {
      const autoName = generateArithmeticName(state && state.operation, operands || (state && state.operands) || []);
      const raw = getCombineNameTouched(state) ? String(state && state.name || '').trim() : autoName;
      return raw || autoName || 'Combination';
    }

    function updateCombineStateNameUserEdited(value) {
      if (!combinePopoverState) return;
      combinePopoverState.nameTouched = !!value;
      combinePopoverState.nameUserEdited = !!value;
    }

    function normalizeCombinePopoverStateOperands() {
      if (!combinePopoverState) return [];
      const op = normalizeArithmeticOperation(combinePopoverState.operation);
      combinePopoverState.operands = normalizeArithmeticInputsForOperation(op, combinePopoverState.operands);
      ensureCombineOperandRowsHaveChoices(combinePopoverState);
      return combinePopoverState.operands;
    }

    function getCombineValidation(state) {
      if (!state) return { ok: false, error: 'No combination is configured.' };
      const scene = sceneGraphController.findScene(state.sceneId);
      if (!scene) return { ok: false, error: 'No scene is focused.' };
      if (!hasEligibleCombineOperands(scene, state)) return { ok: false, error: getNoEligibleOperandsError(state) };
      const op = normalizeArithmeticOperation(state.operation);
      const operands = normalizeArithmeticInputsForOperation(op, state.operands);
      if (op === 'abs' && operands.length !== 1) return { ok: false, error: 'Abs requires exactly one operand.' };
      if (op === 'product' && operands.length < 2) return { ok: false, error: 'Product requires at least two operands.' };
      if (op === 'linear_combination' && operands.length < 1) return { ok: false, error: 'Choose at least one operand.' };
      if (operands.some((input) => !input.layerId)) return { ok: false, error: 'Choose an operand for every row.' };
      const disabledIds = getDisabledCombineOperandIdSet(scene, state);
      if (operands.some((input) => disabledIds.has(input.layerId))) {
        return { ok: false, error: 'Choose a non-circular operand.' };
      }
      const resolved = resolveArithmeticInputs(operands);
      if (resolved.length !== operands.length) return { ok: false, error: 'Choose a valid operand for every row.' };
      const grid = validateArithmeticInputGrids(resolved);
      return grid.ok
        ? { ok: true, operands, resamplePlan: grid.resamplePlan || null }
        : grid;
    }

    function syncCombineAutoName() {
      if (!combinePopoverState || getCombineNameTouched(combinePopoverState)) return;
      combinePopoverState.name = generateArithmeticName(combinePopoverState.operation, combinePopoverState.operands);
    }

    function addCombineOperandTerm() {
      if (!combinePopoverState) return;
      const scene = sceneGraphController.findScene(combinePopoverState.sceneId);
      if (!scene) return;
      const used = new Set((combinePopoverState.operands || []).map((input) => input.layerId));
      const candidate = chooseDefaultCombineOperand(scene, combinePopoverState, used);
      if (!candidate) return;
      combinePopoverState.operands.push({ layerId: candidate.id, coefficient: 1 });
      syncCombineAutoName();
      renderCombinePopover();
    }

    function updateCombineOperation(nextOperation) {
      if (!combinePopoverState) return;
      const previous = combinePopoverState.operation;
      const op = normalizeArithmeticOperation(nextOperation);
      const hadMultipleOperands = Array.isArray(combinePopoverState.operands) && combinePopoverState.operands.length > 1;
      combinePopoverState.operation = op;
      combinePopoverState.operands = normalizeArithmeticInputsForOperation(op, combinePopoverState.operands);
      ensureCombineOperandRowsHaveChoices(combinePopoverState);
      combinePopoverState.absTrimmed = previous !== 'abs' && op === 'abs' && hadMultipleOperands;
      syncCombineAutoName();
      renderCombinePopover();
    }

    function buildCombineInitialOperands(layers, operation) {
      const op = normalizeArithmeticOperation(operation);
      const selected = (Array.isArray(layers) ? layers : []).filter(isCubeLikeLayer);
      const source = selected.length ? selected : [getActiveCubeLayer()].filter(Boolean);
      let operands = source.map((layer, index) => ({
        layerId: layer.id,
        coefficient: index === 1 ? -1 : 1,
      }));
      if (op === 'abs') operands = operands.slice(0, 1).map((input) => Object.assign({}, input, { coefficient: 1 }));
      if (op === 'product') operands = operands.map((input) => Object.assign({}, input, { coefficient: 1 }));
      return operands;
    }

    async function saveEditedArithmeticLayerFromPopover() {
      if (!combinePopoverState || combinePopoverState.busy) return false;
      const layer = sceneGraphController.getLayerById(combinePopoverState.editingLayerId);
      const scene = layer ? sceneGraphController.getSceneForLayer(layer) : null;
      if (!(scene && layer && layer.kind === SCENE_LAYER_KIND.ARITHMETIC)) return false;
      const validation = getCombineValidation(combinePopoverState);
      combinePopoverState.triedCreate = true;
      if (!validation.ok) {
        renderCombinePopover();
        return false;
      }
      const nextOperation = normalizeArithmeticOperation(combinePopoverState.operation);
      const nextInputs = normalizeArithmeticInputsForOperation(nextOperation, validation.operands);
      const unchanged = arithmeticConfigsEqual(layer.operation, layer.inputs, nextOperation, nextInputs);
      const nextNameUserEdited = getCombineNameTouched(combinePopoverState);
      const nextName = getCombineOutputName(combinePopoverState, nextInputs);
      if (unchanged) {
        sceneGraphController.rename(layer.id, nextName);
        layer.nameUserEdited = nextNameUserEdited;
        renderSceneOutliner();
        closeCombinePopover();
        return true;
      }
      const state = combinePopoverState;
      state.busy = true;
      state.abortController = new AbortController();
      renderCombinePopover();
      const staged = await arithmeticLayers.stageUpdate(layer, nextOperation, nextInputs, nextName, { signal: state.abortController.signal });
      if (combinePopoverState !== state) return false;
      state.busy = false;
      if (!staged.ok || !staged.commit()) {
        state.error = staged.error || 'The layers changed during calculation. Please try again.';
        renderCombinePopover();
        return false;
      }
      layer.nameUserEdited = nextNameUserEdited;

      rebuildScene({ preserveView: true, syncGraph: false });
      syncAppearanceControlsToActiveLayer();
      renderSceneOutliner();
      closeCombinePopover();
      setHintMessage(`Updated ${layer.labelId || 'layer'} = ${layer.name || nextName}`);
      return true;
    }

    async function saveCombinedLayerFromPopover() {
      if (combinePopoverState && combinePopoverState.mode === 'edit') return saveEditedArithmeticLayerFromPopover();
      if (!combinePopoverState || combinePopoverState.busy) return false;
      const scene = sceneGraphController.findScene(combinePopoverState.sceneId);
      if (!scene) return false;
      const validation = getCombineValidation(combinePopoverState);
      combinePopoverState.triedCreate = true;
      if (!validation.ok) {
        renderCombinePopover();
        return false;
      }
      const name = getCombineOutputName(combinePopoverState, validation.operands);
      const state = combinePopoverState;
      state.busy = true;
      state.abortController = new AbortController();
      renderCombinePopover();
      const computed = await arithmeticLayers.compute(state.operation, validation.operands, name, { signal: state.abortController.signal });
      if (combinePopoverState !== state || !sceneGraphController.findScene(scene.id)) return false;
      state.busy = false;
      if (!computed.ok) {
        combinePopoverState.error = computed.error || 'Could not compute combination.';
        renderCombinePopover();
        return false;
      }
      const firstOperand = sceneGraphController.getLayerById(validation.operands[0] && validation.operands[0].layerId);
      const wasSingleCubeMode = getVisibleCubeLayerCount(scene) <= 1;
      const newLayer = sceneGraphController.addArithmeticLayer(scene, Object.assign(
        {},
        firstOperand ? copyCubeLayerAppearance(firstOperand) : getSurfaceDefaultsForNewLayer(),
        {
          name,
          labelId: getNextCubeLabelId(scene),
          visible: true,
          operation: normalizeArithmeticOperation(combinePopoverState.operation),
          inputs: validation.operands,
          nameUserEdited: getCombineNameTouched(combinePopoverState),
          cubeData: computed.cubeData,
          cubeDataValid: true,
        }
      ), getSurfaceDefaultsForNewLayer());
      if (!newLayer) return false;
      focusScene(scene);
      flashOutlinerLayer(newLayer.id);
      setActiveSceneGraphLayer(newLayer.id, {
        forceSingleCubeVisibility: wasSingleCubeMode,
        ensureSceneVisible: true,
        ensureLayerVisible: true,
        expandPath: true,
        soloScene: true,
        rebuild: false,
        rebind: false,
        selection: 'replace',
      });
      rebuildScene({ preserveView: true, syncGraph: false });
      syncAppearanceControlsToActiveLayer();
      renderSceneOutliner();
      closeCombinePopover();
      setHintMessage(`Created ${newLayer.labelId || 'layer'} = ${newLayer.name || name}`);
      return true;
    }

    function renderCombinePopover() {
      const popover = ensureCombinePopover();
      if (!popover || !combinePopoverState) return null;
      syncCombineAutoName();
      const scene = sceneGraphController.findScene(combinePopoverState.sceneId);
      const options = scene ? getCombineOperandOptions(scene) : [];
      const op = normalizeArithmeticOperation(combinePopoverState.operation);
      const operands = normalizeCombinePopoverStateOperands();
      const validation = getCombineValidation(combinePopoverState);
      const errorText = combinePopoverState.error || validation.error || '';
      popover.textContent = '';

      const title = document.createElement('div');
      title.className = 'vm-combine-popover__title';
      title.textContent = getCombineTitle(combinePopoverState);
      popover.appendChild(title);

      const opRow = document.createElement('label');
      opRow.className = 'vm-combine-popover__field';
      const opLabel = document.createElement('span');
      opLabel.textContent = 'Operation';
      const opSelect = document.createElement('select');
      opSelect.className = 'vm-combine-popover__select';
      [
        ['linear_combination', 'Linear combination'],
        ['product', 'Product'],
        ['abs', 'Abs'],
      ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = value === op;
        opSelect.appendChild(option);
      });
      opSelect.addEventListener('change', () => updateCombineOperation(opSelect.value));
      opRow.appendChild(opLabel);
      opRow.appendChild(opSelect);
      popover.appendChild(opRow);

      const dividerA = document.createElement('div');
      dividerA.className = 'vm-combine-popover__divider';
      popover.appendChild(dividerA);

      const operandsTitle = document.createElement('div');
      operandsTitle.className = 'vm-combine-popover__section-title';
      operandsTitle.textContent = 'Operands';
      popover.appendChild(operandsTitle);

      operands.forEach((input, index) => {
        const row = document.createElement('div');
        row.className = 'vm-combine-popover__operand';
        if (op === 'linear_combination') {
          const coef = document.createElement('input');
          coef.className = 'vm-combine-popover__coefficient';
          coef.type = 'number';
          coef.step = '0.1';
          coef.value = String(Number.isFinite(Number(input.coefficient)) ? Number(input.coefficient).toFixed(2) : '1.00');
          coef.addEventListener('change', () => {
            combinePopoverState.error = '';
            combinePopoverState.operands[index].coefficient = Number(coef.value);
            syncCombineAutoName();
            renderCombinePopover();
          });
          row.appendChild(coef);
          const times = document.createElement('span');
          times.className = 'vm-combine-popover__times';
          times.textContent = '×';
          row.appendChild(times);
        }
        const select = document.createElement('select');
        select.className = 'vm-combine-popover__select';
        options.forEach((entry) => {
          const layer = entry.layer;
          const option = document.createElement('option');
          option.value = layer.id;
          option.textContent = `${getLayerLabelWithName(layer)}${entry.disabled ? ' (circular)' : ''}`;
          option.disabled = !!entry.disabled;
          option.selected = layer.id === input.layerId;
          select.appendChild(option);
        });
        select.addEventListener('change', () => {
          combinePopoverState.error = '';
          combinePopoverState.operands[index].layerId = select.value;
          syncCombineAutoName();
          renderCombinePopover();
        });
        row.appendChild(select);
        if (op !== 'abs') {
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'vm-combine-popover__icon-button';
          remove.textContent = '×';
          remove.setAttribute('aria-label', 'Remove operand');
          remove.addEventListener('click', () => {
            combinePopoverState.error = '';
            combinePopoverState.operands.splice(index, 1);
            syncCombineAutoName();
            renderCombinePopover();
          });
          row.appendChild(remove);
        }
        popover.appendChild(row);
      });

      if (op === 'abs' && combinePopoverState.absTrimmed) {
        const note = document.createElement('div');
        note.className = 'vm-combine-popover__note';
        note.textContent = 'Abs takes a single operand.';
        popover.appendChild(note);
      }

      if (op !== 'abs') {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'vm-combine-popover__add';
        add.textContent = '+ Add term';
        const used = new Set(operands.map((input) => input.layerId));
        const eligibleOptions = options.filter((entry) => !entry.disabled);
        add.disabled = !eligibleOptions.length || eligibleOptions.every((entry) => used.has(entry.layer.id));
        add.addEventListener('click', addCombineOperandTerm);
        popover.appendChild(add);
      }

      if (validation.ok && validation.resamplePlan) {
        const notice = document.createElement('div');
        notice.className = 'vm-combine-popover__note vm-combine-popover__note--resample';
        notice.textContent = ArithmeticGrid.formatResampleNotice(validation.resamplePlan);
        popover.appendChild(notice);
      }

      const showValidationError = combinePopoverState.triedCreate
        || !!validation.immediate
        || errorText === getNoEligibleOperandsError(combinePopoverState);
      if (errorText && (combinePopoverState.error || (showValidationError && !validation.ok))) {
        const error = document.createElement('div');
        error.className = 'vm-combine-popover__error';
        error.textContent = errorText;
        popover.appendChild(error);
      }

      const dividerB = document.createElement('div');
      dividerB.className = 'vm-combine-popover__divider';
      popover.appendChild(dividerB);

      const nameRow = document.createElement('label');
      nameRow.className = 'vm-combine-popover__field';
      const nameLabel = document.createElement('span');
      nameLabel.textContent = 'Output name';
      const nameInput = document.createElement('input');
      nameInput.className = 'vm-combine-popover__input';
      nameInput.type = 'text';
      nameInput.value = combinePopoverState.name || '';
      nameInput.addEventListener('input', () => {
        updateCombineStateNameUserEdited(true);
        combinePopoverState.name = nameInput.value;
      });
      nameRow.appendChild(nameLabel);
      nameRow.appendChild(nameInput);
      popover.appendChild(nameRow);

      const actions = document.createElement('div');
      actions.className = 'vm-combine-popover__actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'vm-combine-popover__button is-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', closeCombinePopover);
      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'vm-combine-popover__button is-primary';
      create.textContent = combinePopoverState.busy ? 'Calculating…' : getCombineSaveButtonLabel(combinePopoverState);
      create.disabled = !validation.ok || !!combinePopoverState.busy;
      create.addEventListener('click', saveCombinedLayerFromPopover);
      actions.appendChild(cancel);
      actions.appendChild(create);
      popover.appendChild(actions);

      if (combinePopoverState.busy) popover.querySelectorAll('input, select, button').forEach(control => { control.disabled = control !== cancel; });
      popover.hidden = false;
      popover.setAttribute('aria-hidden', 'false');
      positionCombinePopover(combinePopoverState.anchorPoint);
      return popover;
    }

    function showCombinePopover(layers, event = null) {
      const selection = (Array.isArray(layers) ? layers : []).filter(isCubeLikeLayer);
      const scene = selection.length ? sceneGraphController.getSceneForLayer(selection[0]) : getFocusedScene();
      if (!scene) return false;
      const defaultOperation = selection.length <= 1 ? 'abs' : 'linear_combination';
      combinePopoverState = {
        mode: 'create',
        sceneId: scene.id,
        operation: defaultOperation,
        operands: buildCombineInitialOperands(selection, defaultOperation),
        name: '',
        nameTouched: false,
        nameUserEdited: false,
        triedCreate: false,
        error: '',
        absTrimmed: false,
        anchorPoint: {
          clientX: Number(event && event.clientX) || (window.innerWidth || 360) / 2,
          clientY: Number(event && event.clientY) || (window.innerHeight || 360) / 2,
        },
      };
      syncCombineAutoName();
      renderCombinePopover();
      return true;
    }

    function showEditCombinationPopover(layer, event = null) {
      if (!(layer && layer.kind === SCENE_LAYER_KIND.ARITHMETIC)) return false;
      const scene = sceneGraphController.getSceneForLayer(layer);
      if (!scene) return false;
      const operation = normalizeArithmeticOperation(layer.operation);
      const nameUserEdited = getArithmeticNameUserEdited(layer);
      combinePopoverState = {
        mode: 'edit',
        sceneId: scene.id,
        editingLayerId: layer.id,
        operation,
        operands: normalizeArithmeticInputsForOperation(operation, layer.inputs),
        name: String(layer.name || generateArithmeticName(operation, layer.inputs) || 'Combination'),
        nameTouched: nameUserEdited,
        nameUserEdited,
        triedCreate: false,
        error: '',
        absTrimmed: false,
        anchorPoint: {
          clientX: Number(event && event.clientX) || (window.innerWidth || 360) / 2,
          clientY: Number(event && event.clientY) || (window.innerHeight || 360) / 2,
        },
      };
      syncCombineAutoName();
      renderCombinePopover();
      return true;
    }

    function appendOutlinerContextMenuItem(menu, label, onClick, options = {}) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'vm-outliner-context-menu__item';
      item.textContent = label;
      item.setAttribute('role', 'menuitem');
      if (options.danger) item.classList.add('is-danger');
      if (options.disabled) item.disabled = true;
      item.addEventListener('click', () => {
        if (options.keepOpen) {
          onClick();
          return;
        }
        closeCubeLayerContextMenu();
        onClick();
      });
      menu.appendChild(item);
      return item;
    }

    function appendOutlinerContextMenuDivider(menu) {
      const divider = document.createElement('div');
      divider.className = 'vm-outliner-context-menu__divider';
      menu.appendChild(divider);
      return divider;
    }

    function getSceneOrbitalLayerCount(scene) {
      return getCubeLayersInScene(scene).length;
    }

    function renderSceneDeleteConfirmation(scene) {
      const menu = ensureCubeLayerContextMenu();
      if (!menu || !scene) return null;
      menu.textContent = '';
      const title = document.createElement('div');
      title.className = 'vm-outliner-context-menu__title';
      title.textContent = `Delete scene "${scene.name || 'Untitled scene'}"?`;
      menu.appendChild(title);
      const body = document.createElement('div');
      body.className = 'vm-outliner-context-menu__body';
      const count = getSceneOrbitalLayerCount(scene);
      body.textContent = `This will remove the molecule and ${count} orbital layer${count === 1 ? '' : 's'}.\n\nThis action cannot be undone.`;
      menu.appendChild(body);
      const actions = document.createElement('div');
      actions.className = 'vm-outliner-context-menu__actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'vm-outliner-context-menu__button is-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', closeCubeLayerContextMenu);
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'vm-outliner-context-menu__button is-danger';
      confirm.textContent = 'Delete';
      confirm.addEventListener('click', () => {
        closeCubeLayerContextMenu();
        deleteSceneFromOutliner(scene);
      });
      actions.appendChild(cancel);
      actions.appendChild(confirm);
      menu.appendChild(actions);
      return menu;
    }

    function renderOutlinerAddMenu(scene = getFocusedScene()) {
      const menu = ensureCubeLayerContextMenu();
      if (!menu) return null;
      menu.textContent = '';
      appendOutlinerContextMenuItem(menu, 'Add cube file...', () => openOutlinerAddCubeFilePicker(scene));
      return menu;
    }

    function renderNonCubeOutlinerContextMenu(target, mode = 'menu') {
      const menu = ensureCubeLayerContextMenu();
      if (!menu || !target) return null;
      if (target.type === 'scene') {
        if (mode === 'confirm-delete-scene') return renderSceneDeleteConfirmation(target.scene);
        menu.textContent = '';
        appendOutlinerContextMenuItem(menu, 'Rename', () => startOutlinerRename(target));
        appendOutlinerContextMenuDivider(menu);
        appendOutlinerContextMenuItem(menu, 'Delete scene', () => {
          const confirmMenu = renderSceneDeleteConfirmation(target.scene);
          if (confirmMenu) {
            confirmMenu.hidden = false;
            confirmMenu.setAttribute('aria-hidden', 'false');
            positionCubeLayerContextMenu(cubeLayerContextMenuPoint || { clientX: 0, clientY: 0 });
          }
        }, { danger: true, keepOpen: true });
        return menu;
      }
      const layer = target.layer;
      if (!layer) return null;
      if (layer.kind === SCENE_LAYER_KIND.MOLECULE) {
        menu.textContent = '';
        appendOutlinerContextMenuItem(menu, 'Rename', () => startOutlinerRename(target));
        return menu;
      }
      if (layer.kind === SCENE_LAYER_KIND.ORBITALS_GROUP) {
        menu.textContent = '';
        appendOutlinerContextMenuItem(menu, 'Add cube file...', () => openOutlinerAddCubeFilePicker(target.scene));
        return menu;
      }
      return null;
    }

    function renderCubeLayerContextMenu(layer, mode = 'menu') {
      const menu = ensureCubeLayerContextMenu();
      if (!menu || !layer) return null;
      menu.textContent = '';
      const selection = getSelectedCubeLayers();
      const actionLayers = selection.length ? selection : [layer];
      const count = actionLayers.length;
      const deletePlan = getArithmeticCascadeDeletePlan(actionLayers);
      if (mode === 'confirm-delete') {
        const title = document.createElement('div');
        title.className = 'vm-outliner-context-menu__title';
        const deleteCount = deletePlan.layers.length || count;
        title.textContent = deleteCount > 1
          ? `Delete ${deleteCount} layers?`
          : `Delete ${layer.labelId || layer.name || 'cube'}?`;
        menu.appendChild(title);
        const body = document.createElement('div');
        body.className = 'vm-outliner-context-menu__body';
        if (deletePlan.dependents.length) {
          const lines = deletePlan.dependents.map((dependent) => `• ${dependent.labelId || ''} ${dependent.name || 'Layer'}`.trim());
          body.textContent = `This will also delete:\n${lines.join('\n')}\n\nThis action cannot be undone.`;
        } else {
          body.textContent = deleteCount > 1
            ? 'This cannot be undone.'
            : 'This action cannot be undone in Phase 2a-1.';
        }
        menu.appendChild(body);
        const actions = document.createElement('div');
        actions.className = 'vm-outliner-context-menu__actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'vm-outliner-context-menu__button is-secondary';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', closeCubeLayerContextMenu);
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'vm-outliner-context-menu__button is-danger';
        confirm.textContent = 'Delete';
        confirm.addEventListener('click', () => {
          closeCubeLayerContextMenu();
          deleteSelectedCubeLayers();
        });
        actions.appendChild(cancel);
        actions.appendChild(confirm);
        menu.appendChild(actions);
        return menu;
      }

      const duplicate = document.createElement('button');
      duplicate.type = 'button';
      duplicate.className = 'vm-outliner-context-menu__item';
      duplicate.textContent = count > 1 ? `Duplicate (${count})` : 'Duplicate';
      duplicate.addEventListener('click', () => {
        const target = cubeLayerContextMenuLayerId ? sceneGraphController.getLayerById(cubeLayerContextMenuLayerId) : null;
        closeCubeLayerContextMenu();
        if (count > 1) duplicateSelectedCubeLayers();
        else duplicateCubeLayer(target || layer);
      });
      menu.appendChild(duplicate);
      const singleArithmeticLayer = count === 1 && actionLayers[0] && actionLayers[0].kind === SCENE_LAYER_KIND.ARITHMETIC
        ? actionLayers[0]
        : null;
      if (singleArithmeticLayer) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'vm-outliner-context-menu__item';
        edit.textContent = 'Edit combination...';
        edit.addEventListener('click', () => {
          const point = cubeLayerContextMenuPoint || { clientX: 0, clientY: 0 };
          closeCubeLayerContextMenu();
          showEditCombinationPopover(singleArithmeticLayer, point);
        });
        menu.appendChild(edit);
      }
      const combine = document.createElement('button');
      combine.type = 'button';
      combine.className = 'vm-outliner-context-menu__item';
      combine.textContent = count > 1 ? `Combine (${count})...` : 'Combine...';
      combine.addEventListener('click', () => {
        const target = cubeLayerContextMenuLayerId ? sceneGraphController.getLayerById(cubeLayerContextMenuLayerId) : null;
        const layers = getSelectedCubeLayers();
        const combineLayers = layers.length ? layers : [target || layer].filter(Boolean);
        const point = cubeLayerContextMenuPoint || { clientX: 0, clientY: 0 };
        closeCubeLayerContextMenu();
        showCombinePopover(combineLayers, point);
      });
      menu.appendChild(combine);
      const divider = document.createElement('div');
      divider.className = 'vm-outliner-context-menu__divider';
      menu.appendChild(divider);
      if (count === 1) {
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'vm-outliner-context-menu__item';
        rename.textContent = 'Rename';
        rename.addEventListener('click', () => {
          const targetLayer = actionLayers[0] || layer;
          const targetScene = targetLayer ? sceneGraphController.getSceneForLayer(targetLayer) : null;
          closeCubeLayerContextMenu();
          startOutlinerRename({ type: 'layer', id: targetLayer.id, layer: targetLayer, scene: targetScene });
        });
        menu.appendChild(rename);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'vm-outliner-context-menu__item is-danger';
      del.textContent = count > 1 ? `Delete (${count})` : 'Delete';
      del.addEventListener('click', () => {
        const target = cubeLayerContextMenuLayerId ? sceneGraphController.getLayerById(cubeLayerContextMenuLayerId) : null;
        renderCubeLayerContextMenu(target || layer, 'confirm-delete');
      });
      menu.appendChild(del);
      return menu;
    }

    function focusOutlinerContextTarget(target) {
      if (!target) return;
      const scene = target.scene || (target.layer ? sceneGraphController.getSceneForLayer(target.layer) : null);
      if (!scene) return;
      focusScene(scene);
      activateSceneFocusRecord(scene);
      syncLoadedSceneControls();
      syncTrajectoryControls();
      syncAppearanceControlsToActiveLayer();
    }

    function showOutlinerContextMenu(target, event) {
      if (!(target && (target.scene || target.layer))) return;
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (outlinerRenameState) finishOutlinerRename({ commit: true });
      const layer = target.layer;
      if (isCubeLikeLayer(layer)) {
        if (!isCubeLayerSelected(layer)) {
          setActiveSceneGraphLayer(layer.id, { rebuild: false, selection: 'replace' });
        } else {
          const scene = sceneGraphController.getSceneForLayer(layer);
          if (scene) focusScene(scene);
        }
        syncAppearanceControlsToActiveLayer();
        cubeLayerContextMenuLayerId = layer.id;
        cubeLayerContextMenuPoint = event
          ? { clientX: event.clientX, clientY: event.clientY }
          : null;
        const menu = renderCubeLayerContextMenu(layer, 'menu');
        if (!menu) return;
        menu.hidden = false;
        menu.setAttribute('aria-hidden', 'false');
        positionCubeLayerContextMenu(event);
        return;
      }
      focusOutlinerContextTarget(target);
      cubeLayerContextMenuLayerId = layer && layer.id;
      cubeLayerContextMenuPoint = event
        ? { clientX: event.clientX, clientY: event.clientY }
        : null;
      const menu = renderNonCubeOutlinerContextMenu(target, 'menu');
      if (!menu) return;
      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      positionCubeLayerContextMenu(event);
    }

    function showCubeLayerContextMenu(layer, event) {
      if (!isCubeLikeLayer(layer)) return;
      showOutlinerContextMenu({
        type: 'layer',
        id: layer.id,
        layer,
        scene: sceneGraphController.getSceneForLayer(layer),
      }, event);
    }

    function showOutlinerAddMenu(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (outlinerRenameState) finishOutlinerRename({ commit: true });
      const scene = getFocusedScene();
      cubeLayerContextMenuLayerId = null;
      const rect = sceneOutlinerAddBtn ? sceneOutlinerAddBtn.getBoundingClientRect() : null;
      cubeLayerContextMenuPoint = rect
        ? { clientX: rect.left, clientY: rect.bottom + 4 }
        : { clientX: Number(event && event.clientX) || 0, clientY: Number(event && event.clientY) || 0 };
      const menu = renderOutlinerAddMenu(scene);
      if (!menu) return;
      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      positionCubeLayerContextMenu(cubeLayerContextMenuPoint);
    }


    if (sceneOutlinerBodyEl) {
      sceneOutlinerBodyEl.addEventListener('click', (event) => {
        const target = event.target;
        if (target && typeof target.closest === 'function' && target.closest('.vm-outliner-row')) return;
        clearOutlinerSelectionToActive();
      });
      sceneOutlinerBodyEl.addEventListener('dragover', (event) => {
        if (!outlinerDragState) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
        clearOutlinerDropFeedback();
      });
      sceneOutlinerBodyEl.addEventListener('drop', (event) => {
        if (!outlinerDragState) return;
        event.preventDefault();
        outlinerDragState = null;
        clearOutlinerDragVisuals();
      });
    }

    if (sceneOutlinerAddBtn) {
      sceneOutlinerAddBtn.hidden = false;
      sceneOutlinerAddBtn.disabled = false;
      sceneOutlinerAddBtn.addEventListener('click', showOutlinerAddMenu);
    }

    document.addEventListener('pointerdown', (event) => {
      if (getCurrentMode() !== MODES.DISPLAY) return;
      const target = event.target;
      if (!target || (typeof target.closest !== 'function')) return;
      if (target.closest('#toolbar')) return;
      if (cubeLayerContextMenuEl && target.closest('.vm-outliner-context-menu')) return;
      if (combinePopoverEl && target.closest('.vm-combine-popover')) return;
      if (target.closest('button, input, select, textarea, a, [role="button"], [role="menu"], [role="dialog"]')) return;
      clearOutlinerSelectionToActive({ rebind: true, render: true });
    }, true);

    return Object.freeze({
      scheduleOutlinerScrollToTarget,
      flashOutlinerLayer,
      finishOutlinerRename,
      renderSceneOutliner,
      closeCubeLayerContextMenu,
      isFocusInsideOutliner,
      showDeleteSelectedCubeLayersConfirmation,
      closeCombinePopover,
      isRenaming: () => !!outlinerRenameState,
      isComputing: () => !!(combinePopoverState && combinePopoverState.busy),
    });
  }

  global.VibeMolSceneOutliner = Object.freeze({ createSceneOutliner });
})(typeof window !== 'undefined' ? window : globalThis);
