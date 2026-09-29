(function (global) {
  'use strict';
  const AXES = ['x', 'y', 'z'];
  const COLORS = ['#d9433c', '#218445', '#2474c4'];
  const ARROW_COLORS = ['#ff4136', '#2ecc40', '#0074d9'];
  const RADIUS = 12;

  // Use the true projections, including overlaps: moving endpoints apart makes
  // the orientation indicator jump while rotating through a head-on view.
  function projectEndpoints(THREE, quaternion, size) {
    const inverse = quaternion.clone().invert(), center = size / 2;
    const length = Math.max(0, center - RADIUS - 5);
    return AXES.flatMap((axis, index) => [1, -1].map(sign => {
      const p = new THREE.Vector3(); p[axis] = sign; p.applyQuaternion(inverse);
      return { axis, sign, index, depth: p.z, x: center + p.x * length, y: center - p.y * length };
    }));
  }

  function create({ THREE, onSelect, onEscape }) {
    const root = document.createElement('div');
    root.id = 'axisGizmo'; root.className = 'vm-axis-gizmo'; root.hidden = true;
    root.setAttribute('role', 'toolbar'); root.setAttribute('aria-label', 'Camera orientation');
    document.body.append(root);
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000);
    camera.position.z = 400;
    const arrows = new THREE.Group(); scene.add(arrows);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, .9);
    const light = new THREE.DirectionalLight(0xffffff, 1.2); light.position.set(1, 1, 1);
    scene.add(hemi, light);
    const shaftGeometry = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
    const headGeometry = new THREE.ConeGeometry(1, 1, 20, 1);
    const segments = AXES.flatMap((axis, index) => [1, -1].map(sign => {
      const group = new THREE.Group(), direction = new THREE.Vector3(); direction[axis] = sign;
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      const material = new THREE.MeshStandardMaterial({ color: ARROW_COLORS[index], roughness: .35, metalness: .15,
        transparent: sign < 0, opacity: sign < 0 ? .35 : 1, depthWrite: sign > 0 });
      const shaft = new THREE.Mesh(shaftGeometry, material); group.add(shaft);
      // Markers establish their per-pixel depth first. A shallow-angle shaft
      // can have a nearer surface even when its center sorts behind a marker.
      // Render translucent shafts afterward so depth testing, not object-center
      // ordering, decides which portions overlap the discs.
      if (sign < 0) shaft.renderOrder = 1;
      const head = sign > 0 ? new THREE.Mesh(headGeometry, material) : null;
      if (head) group.add(head);
      arrows.add(group); return { sign, shaft, head };
    }));
    // Markers render before translucent shafts, writing depth only within
    // their discs. The shafts then blend over genuinely nearer fragments.
    const markers = AXES.flatMap(axis => [1, -1].map(sign => {
      const image = document.createElement('canvas'); image.width = image.height = 64;
      const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, alphaTest: .01, depthWrite: true, toneMapped: false }));
      sprite.name = 'axis-gizmo-' + (sign > 0 ? 'positive-' : 'negative-') + axis;
      sprite.scale.set(28, 28, 1); scene.add(sprite);
      return { image, texture, object: sprite };
    }));
    let dirty = true, hover = null, focused = null, lastPose = '', lastLayout = '', lastSize = 0, nodes = [];
    let palette = null;
    function invalidateTheme() { palette = null; dirty = true; }
    const observer = new MutationObserver(invalidateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-font', 'style'] });
    document.fonts?.ready.then(invalidateTheme);
    const buttons = AXES.flatMap((axis, index) => [1, -1].map(sign => {
      const button = document.createElement('button'), label = (sign > 0 ? '+' : '−') + axis.toUpperCase();
      button.id = 'viewAxis' + (sign < 0 ? 'Neg' : '') + axis.toUpperCase() + 'Btn';
      button.type = 'button'; button.className = 'vm-axis-gizmo__end';
      button.dataset.axis = axis; button.dataset.sign = String(sign);
      button.setAttribute('aria-label', 'View from ' + label);
      button.setAttribute('data-tooltip', 'View from ' + label + ' toward the current target');
      button.setAttribute('data-tooltip-placement', 'top');
      button.tabIndex = index === 0 && sign > 0 ? 0 : -1;
      let press = null, dragged = false;
      button.onpointerdown = e => {
        if (e.button !== 0) return;
        press = { x: e.clientX, y: e.clientY }; dragged = false;
        button.setPointerCapture(e.pointerId);
      };
      button.onpointermove = e => {
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) dragged = true;
      };
      button.onpointerup = () => { press = null; };
      button.onpointercancel = () => { press = null; dragged = true; };
      button.onclick = e => { if (!e.detail || !dragged) onSelect(axis, sign); };
      button.onpointerenter = () => { hover = button; dirty = true; };
      button.onpointerleave = () => { hover = null; dirty = true; };
      button.onfocus = () => {
        focused = button; dirty = true;
        buttons.forEach(item => { item.tabIndex = item === button ? 0 : -1; });
      };
      button.onblur = () => { focused = null; dirty = true; };
      root.append(button); return button;
    }));
    // UI gestures must not place/select atoms or start camera dragging.
    for (const event of ['pointerdown', 'pointerup', 'pointermove', 'click', 'dblclick']) {
      root.addEventListener(event, e => e.stopPropagation());
    }
    root.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
    const navigationKeys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'];
    root.addEventListener('keyup', e => { if (navigationKeys.includes(e.key)) e.stopPropagation(); });
    root.addEventListener('keydown', e => {
      if (navigationKeys.includes(e.key)) e.stopPropagation();
      const i = buttons.indexOf(document.activeElement);
      let next = null;
      if (['ArrowRight', 'ArrowDown'].includes(e.key)) next = (i + 1) % 6;
      if (['ArrowLeft', 'ArrowUp'].includes(e.key)) next = (i + 5) % 6;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = 5;
      if (next !== null) { e.preventDefault(); buttons[next].focus({ preventScroll: true }); }
      if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
    });

    function draw() {
      if (!palette) {
        const style = getComputedStyle(root);
        palette = { background: style.getPropertyValue('--vm-color-surface-panel').trim() || '#ffffff',
          foreground: style.getPropertyValue('--vm-color-text-primary').trim() || '#111827', font: style.fontFamily };
      }
      nodes.forEach((node, i) => {
        const marker = markers[i], active = buttons[i] === hover || buttons[i] === focused;
        const { image, texture } = marker, ctx = image.getContext('2d');
        ctx.setTransform(64 / 28, 0, 0, 64 / 28, 0, 0); ctx.clearRect(0, 0, 28, 28);
        ctx.beginPath(); ctx.arc(14, 14, RADIUS - 1, 0, Math.PI * 2);
        ctx.fillStyle = node.sign > 0 ? COLORS[node.index] : palette.background; ctx.fill();
        ctx.strokeStyle = COLORS[node.index]; ctx.lineWidth = 1.5; ctx.stroke();
        if (node.sign > 0) {
          ctx.font = '600 11px ' + palette.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff'; ctx.fillText(node.axis.toUpperCase(), 14, 14.5);
        }
        if (active || node.depth > .99999) {
          ctx.beginPath(); ctx.arc(14, 14, RADIUS + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = active ? palette.foreground : COLORS[node.index]; ctx.lineWidth = 1.5; ctx.stroke();
        }
        texture.needsUpdate = true;
      });
      dirty = false;
    }

    function update(viewCamera, layout, visible) {
      root.hidden = !visible || layout.size < 88;
      if (root.hidden) return false;
      const { size, left, top } = layout;
      const key = [left, top, size].join(',');
      if (key !== lastLayout) {
        Object.assign(root.style, { left: left + 'px', top: top + 'px', width: size + 'px', height: size + 'px' });
        lastLayout = key;
      }
      if (lastSize !== size) {
        const center = size / 2, length = center - RADIUS - 5;
        camera.left = -center; camera.right = center; camera.top = center; camera.bottom = -center;
        camera.updateProjectionMatrix();
        // Original shaded shaft/cone proportions; leave room for the markers.
        const scale = (length - 10) / 1.05;
        segments.forEach(({ sign, shaft, head }) => {
          const shaftLength = sign > 0 ? .75 * scale : length;
          shaft.scale.set(.05 * scale, shaftLength, .05 * scale); shaft.position.y = shaftLength / 2;
          if (head) { head.scale.set(.12 * scale, .3 * scale, .12 * scale); head.position.y = shaftLength + .15 * scale; }
        });
        lastSize = size;
      }
      // OrbitControls can drift by floating-point epsilons at the poles. Avoid
      // updating projections for subpixel changes while idle.
      const pose = viewCamera.quaternion.toArray().map(v => v.toFixed(6)).join(',') + '/' + size;
      if (pose !== lastPose) {
        const projected = projectEndpoints(THREE, viewCamera.quaternion, size);
        dirty ||= projected.some((node, i) => (node.depth > .99999) !== (nodes[i]?.depth > .99999));
        nodes = projected; lastPose = pose;
        arrows.quaternion.copy(viewCamera.quaternion).invert();
        const order = [...nodes].sort((a, b) => a.depth - b.depth);
        const center = size / 2, length = center - RADIUS - 5;
        nodes.forEach((node, i) => {
          const depthOrder = order.indexOf(node);
          Object.assign(buttons[i].style, { left: (node.x - RADIUS) + 'px', top: (node.y - RADIUS) + 'px', zIndex: depthOrder + 1 });
          markers[i].object.position.set(node.x - center, center - node.y, node.depth * length);
          if (node.sign < 0) {
            const shaft = segments[i].shaft;
            const projectedLength = Math.hypot(node.x - center, node.y - center);
            // Meet the outside of the ring, including the cap's projected
            // radius. Near head-on, the circle covers the entire segment.
            const clearance = RADIUS - .25 + shaft.scale.x * Math.abs(node.depth);
            const shaftLength = projectedLength > clearance ? length * (1 - clearance / projectedLength) : 0;
            shaft.scale.y = Math.max(1e-6, shaftLength); shaft.position.y = shaftLength / 2;
          }
          if (node.depth > .99999) buttons[i].setAttribute('aria-current', 'true');
          else buttons[i].removeAttribute('aria-current');
        });
      }
      if (dirty) draw();
      return true;
    }
    return Object.freeze({ scene, camera, update });
  }
  global.VibeMolAxisGizmo = Object.freeze({ create, projectEndpoints });
})(typeof window !== 'undefined' ? window : globalThis);
