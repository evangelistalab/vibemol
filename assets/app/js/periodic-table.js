(function (global) {
  'use strict';

  function createPeriodicTableController(deps) {
    const {
      THREE,
      ATOM_Z_TO_DATA,
      ATOM_SYMBOL_TO_Z,
      UI_PALETTE,
      getActiveElementHexColor,
      getElementSymbol,
      getElementName,
      editAppearanceSettings,
      exportElementColorOverrides,
      normalizeHexColor,
      els,
    } = deps;

    const PERIODIC_TABLE_LAYOUT = [
      ['H', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'He'],
      ['Li', 'Be', '', '', '', '', '', '', '', '', '', '', 'B', 'C', 'N', 'O', 'F', 'Ne'],
      ['Na', 'Mg', '', '', '', '', '', '', '', '', '', '', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'],
      ['K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr'],
      ['Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe'],
      ['Cs', 'Ba', 'La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn'],
      ['Fr', 'Ra', 'Ac', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', ''],
      ['', '', '', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', '', '', '', ''],
    ];
    const periodicNodesByZ = new Map();
    const periodicPickTargets = [];
    let periodicTableRenderer = null;
    let periodicTableScene = null;
    let periodicTableCamera = null;
    let periodicTableControls = null;
    let periodicTableRoot = null;
    let periodicTableRaf = 0;
    const periodicRaycaster = new THREE.Raycaster();
    const periodicPointer = new THREE.Vector2();
    let selectedElementForEditor = 6;
    const PERIODIC_TABLE_NODE_SCALE = 1.25;
    const PERIODIC_TABLE_SELECTED_SCALE = 1.3;
    const PERIODIC_TABLE_SPHERE_RADIUS = 0.34;
    const PERIODIC_TABLE_OUTLINE_SCALE = 1.12;
    const PERIODIC_TABLE_VIEW_MARGIN = 1.08;

    /**
     * Build a compact symbol sprite for one periodic table sphere.
     * @param {string} symbol
     * @returns {THREE.Sprite}
     */
    function makePeriodicSymbolSprite(symbol) {
      const txt = (symbol || '?').trim().slice(0, 3);
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 54px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
      ctx.fillStyle = UI_PALETTE.periodicSymbolFill;
      ctx.strokeStyle = UI_PALETTE.periodicSymbolStroke;
      ctx.lineWidth = 5;
      ctx.strokeText(txt, c.width * 0.5, c.height * 0.52);
      ctx.fillText(txt, c.width * 0.5, c.height * 0.52);
      const tex = new THREE.CanvasTexture(c);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(0.72, 0.36, 1);
      spr.renderOrder = 22;
      return spr;
    }

    /**
     * Return the 3D position for a periodic table slot.
     * @param {number} row
     * @param {number} col
     * @returns {THREE.Vector3}
     */
    function getPeriodicTablePosition(row, col) {
      const sx = 1.28;
      const sy = 1.12;
      const x = (col - 8.5) * sx;
      const y = (4 - row) * sy;
      // Keep lanthanides/actinides on the same depth plane as the main table.
      const z = 0;
      return new THREE.Vector3(x, y, z);
    }

    /**
     * Compute half-extents of visible periodic-table content in local scene space.
     * Includes selected-node enlargement and outline shell padding.
     * @returns {{halfW:number, halfH:number}}
     */
    function getPeriodicTableHalfExtents() {
      let maxX = 0;
      let maxY = 0;
      for (let row = 0; row < PERIODIC_TABLE_LAYOUT.length; row++) {
        const cols = PERIODIC_TABLE_LAYOUT[row];
        for (let col = 0; col < cols.length; col++) {
          const symbol = (cols[col] || '').trim();
          if (!symbol) continue;
          const z = ATOM_SYMBOL_TO_Z && ATOM_SYMBOL_TO_Z[symbol.toUpperCase()];
          if (!Number.isInteger(z) || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) continue;
          const p = getPeriodicTablePosition(row, col);
          maxX = Math.max(maxX, Math.abs(p.x));
          maxY = Math.max(maxY, Math.abs(p.y));
        }
      }
      const shellPad = PERIODIC_TABLE_SPHERE_RADIUS
        * PERIODIC_TABLE_NODE_SCALE
        * PERIODIC_TABLE_SELECTED_SCALE
        * PERIODIC_TABLE_OUTLINE_SCALE
        + 0.12;
      return {
        halfW: maxX + shellPad,
        halfH: maxY + shellPad,
      };
    }

    /**
     * Resize the periodic-table renderer and camera to viewport size.
     */
    function resizePeriodicTableScene() {
      if (!periodicTableRenderer || !periodicTableCamera || !els.periodicTableViewport) return;
      const w = Math.max(10, els.periodicTableViewport.clientWidth | 0);
      const h = Math.max(10, els.periodicTableViewport.clientHeight | 0);
      periodicTableRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      periodicTableRenderer.setSize(w, h, false);
      const aspect = w / h;
      if (periodicTableCamera.isOrthographicCamera) {
        const ext = getPeriodicTableHalfExtents();
        const orthoHalfHeight = Math.max(ext.halfH, ext.halfW / Math.max(1e-6, aspect)) * PERIODIC_TABLE_VIEW_MARGIN;
        periodicTableCamera.left = -orthoHalfHeight * aspect;
        periodicTableCamera.right = orthoHalfHeight * aspect;
        periodicTableCamera.top = orthoHalfHeight;
        periodicTableCamera.bottom = -orthoHalfHeight;
        periodicTableCamera.zoom = 1;
      } else {
        periodicTableCamera.aspect = aspect;
      }
      periodicTableCamera.updateProjectionMatrix();
    }

    /**
     * Render one periodic-table frame.
     */
    function renderPeriodicTableFrame() {
      if (!periodicTableRenderer || !periodicTableScene || !periodicTableCamera) return;
      if (periodicTableControls) periodicTableControls.update();
      periodicTableRenderer.render(periodicTableScene, periodicTableCamera);
    }

    /**
     * Periodic-table animation loop while popup is open.
     */
    function periodicTableLoop() {
      if (!els.elementColorOverlay || els.elementColorOverlay.style.display !== 'flex') {
        periodicTableRaf = 0;
        return;
      }
      renderPeriodicTableFrame();
      periodicTableRaf = requestAnimationFrame(periodicTableLoop);
    }

    /**
     * Start periodic-table rendering loop if not already active.
     */
    function startPeriodicTableLoop() {
      if (periodicTableRaf) return;
      periodicTableRaf = requestAnimationFrame(periodicTableLoop);
    }

    /**
     * Stop periodic-table rendering loop.
     */
    function stopPeriodicTableLoop() {
      if (!periodicTableRaf) return;
      cancelAnimationFrame(periodicTableRaf);
      periodicTableRaf = 0;
    }

    /**
     * Ensure periodic-table scene resources are created.
     */
    function ensurePeriodicTableScene() {
      if (periodicTableScene || !els.periodicTableCanvas) return;

      periodicTableRenderer = new THREE.WebGLRenderer({
        canvas: els.periodicTableCanvas,
        antialias: true,
        alpha: true,
      });
      periodicTableScene = new THREE.Scene();
      periodicTableCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
      periodicTableCamera.position.set(0, 0, 32);
      periodicTableCamera.lookAt(0, 0, 0);

      periodicTableScene.add(
        new THREE.AmbientLight(0xffffff, 0.85)
      );
      const d1 = new THREE.DirectionalLight(0xffffff, 0.95);
      // Push the key highlight higher on a top-right diagonal.
      d1.position.set(4.5, 5.0, 0.5);
      periodicTableScene.add(d1);
      const d2 = new THREE.DirectionalLight(0x9fc2ff, 0.45);
      d2.position.set(-2.6, -1.4, -2.2);
      periodicTableScene.add(d2);

      periodicTableRoot = new THREE.Group();
      periodicTableRoot.rotation.x = 0;
      periodicTableRoot.rotation.y = 0;
      periodicTableScene.add(periodicTableRoot);

      const sphereGeom = new THREE.SphereGeometry(PERIODIC_TABLE_SPHERE_RADIUS, 24, 18);
      periodicNodesByZ.clear();
      periodicPickTargets.length = 0;
      for (let row = 0; row < PERIODIC_TABLE_LAYOUT.length; row++) {
        const cols = PERIODIC_TABLE_LAYOUT[row];
        for (let col = 0; col < cols.length; col++) {
          const symbol = (cols[col] || '').trim();
          if (!symbol) continue;
          const z = ATOM_SYMBOL_TO_Z && ATOM_SYMBOL_TO_Z[symbol.toUpperCase()];
          if (!Number.isInteger(z) || !ATOM_Z_TO_DATA || !ATOM_Z_TO_DATA[z]) continue;

          const colorHex = getActiveElementHexColor(z);
          const mat = new THREE.MeshPhongMaterial({
            color: new THREE.Color(colorHex),
            specular: 0xffffff,
            shininess: 120,
            emissive: new THREE.Color(0x08111c),
            emissiveIntensity: 0.06,
          });
          const mesh = new THREE.Mesh(sphereGeom, mat);
          mesh.position.copy(getPeriodicTablePosition(row, col));
          mesh.userData = { periodicZ: z };
          mesh.scale.setScalar(PERIODIC_TABLE_NODE_SCALE);

          const outlineMat = new THREE.MeshBasicMaterial({
            color: 0x0c1624,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.62,
          });
          const outline = new THREE.Mesh(sphereGeom, outlineMat);
          outline.scale.setScalar(PERIODIC_TABLE_OUTLINE_SCALE);
          mesh.add(outline);

          const label = makePeriodicSymbolSprite(symbol);
          label.position.set(0, 0, 0.52);
          mesh.add(label);

          periodicTableRoot.add(mesh);
          periodicNodesByZ.set(z, { mesh, outlineMat, label, symbol });
          periodicPickTargets.push(mesh);
        }
      }

      // Static preview: disable pan/zoom interactions in this panel.
      periodicTableControls = null;

      els.periodicTableCanvas.addEventListener('pointerdown', (e) => {
        if (!periodicTableCamera || !periodicPickTargets.length) return;
        const rect = els.periodicTableCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        periodicPointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        periodicPointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        periodicRaycaster.setFromCamera(periodicPointer, periodicTableCamera);
        const hits = periodicRaycaster.intersectObjects(periodicPickTargets, false);
        if (!hits.length) return;
        const hit = hits[0].object;
        const z = hit && hit.userData ? hit.userData.periodicZ : null;
        if (!Number.isInteger(z)) return;
        selectElementForColorEditor(z);
        renderPeriodicTableFrame();
      });

      resizePeriodicTableScene();
    }

    /**
     * Refresh one periodic-table node color/highlight from current state.
     * @param {number} z
     */
    function refreshPeriodicCell(z) {
      const node = periodicNodesByZ.get(z | 0);
      if (!node || !node.mesh || !node.mesh.material) return;
      const hex = getActiveElementHexColor(z);
      node.mesh.material.color.set(hex);
      const selected = (z | 0) === selectedElementForEditor;
      node.mesh.scale.setScalar((selected ? PERIODIC_TABLE_SELECTED_SCALE : 1.0) * PERIODIC_TABLE_NODE_SCALE);
      node.mesh.material.emissiveIntensity = selected ? 0.28 : 0.06;
      if (node.outlineMat) node.outlineMat.opacity = selected ? 0.92 : 0.62;
      if (node.label) node.label.material.opacity = selected ? 1.0 : 0.9;
    }

    /**
     * Refresh all periodic table cell swatches.
     */
    function refreshPeriodicCells() {
      for (const z of periodicNodesByZ.keys()) refreshPeriodicCell(z);
    }

    /**
     * Mark one element as selected in the color editor.
     * @param {number} z
     */
    function selectElementForColorEditor(z) {
      const next = z | 0;
      if (next < 0) return;
      selectedElementForEditor = next;
      if (els.elementColorPicker) {
        els.elementColorPicker.value = getActiveElementHexColor(selectedElementForEditor);
      }
      if (els.elementColorName) {
        const symbol = getElementSymbol(selectedElementForEditor);
        const name = getElementName(selectedElementForEditor);
        els.elementColorName.textContent = `${symbol} — ${name} (Z=${selectedElementForEditor})`;
      }
      refreshPeriodicCells();
    }

    /**
     * Build the periodic table editor scene once.
     */
    function buildPeriodicTableEditor() {
      ensurePeriodicTableScene();
      refreshPeriodicCells();
      selectElementForColorEditor(selectedElementForEditor);
      resizePeriodicTableScene();
      renderPeriodicTableFrame();
    }

    /**
     * Toggle periodic-table overlay visibility.
     * @param {boolean} open
     */
    function setElementColorOverlayOpen(open) {
      if (!els.elementColorOverlay) return;
      const isOpen = !!open;
      els.elementColorOverlay.style.display = isOpen ? 'flex' : 'none';
      els.elementColorOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      if (isOpen) {
        buildPeriodicTableEditor();
        refreshPeriodicCells();
        selectElementForColorEditor(selectedElementForEditor);
        startPeriodicTableLoop();
      } else {
        stopPeriodicTableLoop();
      }
    }

    // Registration stays at the original late UI-wiring point in app.js.
    function bindControls() {
      if (els.elementColorClose) els.elementColorClose.onclick = () => setElementColorOverlayOpen(false);
      if (els.elementColorOverlay) {
        els.elementColorOverlay.addEventListener('click', (e) => {
          if (e.target === els.elementColorOverlay) setElementColorOverlayOpen(false);
        });
      }
      /**
       * Apply the current picker value as an override for the selected element.
       */
      function applyElementColorPickerValue(event) {
        if (!els.elementColorPicker) return;
        editAppearanceSettings({ 'global.elementColorOverrides': {
          ...exportElementColorOverrides(), [selectedElementForEditor]: normalizeHexColor(els.elementColorPicker.value, getActiveElementHexColor(selectedElementForEditor)),
        } }, event?.type);
      }
      if (els.elementColorPicker) {
        // Some browsers commit `<input type="color">` on `change` only.
        els.elementColorPicker.oninput = applyElementColorPickerValue;
        els.elementColorPicker.onchange = applyElementColorPickerValue;
      }
      if (els.elementColorResetOne) {
        els.elementColorResetOne.onclick = () => {
          const colors = exportElementColorOverrides();
          delete colors[selectedElementForEditor];
          editAppearanceSettings({ 'global.elementColorOverrides': colors });
        };
      }
      if (els.elementColorResetAll) els.elementColorResetAll.onclick = () => editAppearanceSettings({ 'global.elementColorOverrides': {} });
    }

    function getPendingColor() {
      if (!els.elementColorPicker) return null;
      const active = getActiveElementHexColor(selectedElementForEditor);
      const pending = normalizeHexColor(els.elementColorPicker.value, active);
      return { z: selectedElementForEditor, active, pending };
    }

    function syncColorPicker() {
      if (els.elementColorPicker) els.elementColorPicker.value = getActiveElementHexColor(selectedElementForEditor);
    }

    return Object.freeze({
      setOpen: setElementColorOverlayOpen,
      isOpen: () => !!(els.elementColorOverlay && els.elementColorOverlay.getAttribute('aria-hidden') === 'false'),
      isVisible: () => !!(els.elementColorOverlay && els.elementColorOverlay.style.display === 'flex'),
      refreshCells: refreshPeriodicCells,
      syncColorPicker,
      getPendingColor,
      bindControls,
    });
  }

  global.VibeMolPeriodicTable = Object.freeze({ createPeriodicTableController });
})(typeof window !== 'undefined' ? window : globalThis);
