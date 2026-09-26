(function (global) {
  'use strict';
  const AXES = ['x', 'y', 'z'];
  const COLORS = ['#d9433c', '#218445', '#2474c4'];
  const RADIUS = 12;

  // Screen coordinates shared by rendering and native button hit targets.
  // Rear endpoints get short leaders when their projection overlaps a nearer
  // endpoint, so opposite views remain reachable even in a head-on view.
  function projectEndpoints(THREE, quaternion, size) {
    const inverse = quaternion.clone().invert(), center = size / 2;
    const length = Math.max(0, center - RADIUS - 5);
    const nodes = AXES.flatMap((axis, index) => [1, -1].map(sign => {
      const p = new THREE.Vector3(); p[axis] = sign; p.applyQuaternion(inverse);
      return { axis, sign, index, depth: p.z, x: center + p.x * length, y: center - p.y * length };
    }));
    const placed = [];
    let crowded = false;
    for (const node of [...nodes].sort((a, b) => b.depth - a.depth || a.index - b.index || b.sign - a.sign)) {
      node.anchorX = node.x; node.anchorY = node.y;
      const fits = (x, y) => x >= RADIUS + 2 && y >= RADIUS + 2 && x <= size - RADIUS - 2 && y <= size - RADIUS - 2
        && placed.every(p => Math.hypot(p.x - x, p.y - y) >= RADIUS * 2 + 3);
      let found = false;
      search: for (let r = 0; r <= size; r += 2) {
        for (let i = 0; i < (r ? 32 : 1); i++) {
          const angle = Math.PI / 4 + i * Math.PI / 16;
          const x = node.anchorX + r * Math.cos(angle), y = node.anchorY + r * Math.sin(angle);
          if (fits(x, y)) { node.x = x; node.y = y; found = true; break search; }
        }
      }
      placed.push(node);
      if (!found) crowded = true;
    }
    if (crowded) {
      // At very small sizes, greedy placement can trap the last endpoint.
      // Use six perimeter slots, preserving angular order and minimizing travel.
      const ordered = [...nodes].sort((a, b) => Math.atan2(a.anchorY - center, a.anchorX - center)
        - Math.atan2(b.anchorY - center, b.anchorX - center));
      let best = null, cost = Infinity;
      for (let rotation = 0; rotation < 64; rotation++) {
        const slots = ordered.map((_, i) => ({ x: center + (center - 14) * Math.cos(rotation * Math.PI / 32 + i * Math.PI / 3),
          y: center + (center - 14) * Math.sin(rotation * Math.PI / 32 + i * Math.PI / 3) }));
        const travel = slots.reduce((sum, p, i) => sum + (p.x - ordered[i].anchorX) ** 2 + (p.y - ordered[i].anchorY) ** 2, 0);
        if (travel < cost) { cost = travel; best = slots; }
      }
      ordered.forEach((node, i) => Object.assign(node, best[i]));
    }
    return nodes;
  }

  function create({ THREE, onSelect, onEscape }) {
    const root = document.createElement('div');
    root.id = 'axisGizmo'; root.className = 'vm-axis-gizmo'; root.hidden = true;
    root.setAttribute('role', 'toolbar'); root.setAttribute('aria-label', 'Camera orientation');
    document.body.append(root);
    const image = document.createElement('canvas'), ctx = image.getContext('2d');
    const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.z = 2;
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    })));
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

    function draw(size) {
      if (!palette) {
        const style = getComputedStyle(root);
        palette = { background: style.getPropertyValue('--vm-color-surface-panel').trim() || '#ffffff',
          foreground: style.getPropertyValue('--vm-color-text-primary').trim() || '#111827', font: style.fontFamily };
      }
      // Render in the main WebGL canvas as well as exposing native hit targets,
      // so PNG and video exports retain the orientation indicator and labels.
      if (lastSize !== size) {
        // Three/WebGL texture storage has a fixed size after its first upload.
        // Reallocate on responsive resize instead of leaving stale edge pixels.
        texture.dispose();
        image.width = image.height = Math.ceil(size * 2); lastSize = size;
      }
      ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, size, size);
      const order = [...nodes].sort((a, b) => a.depth - b.depth);
      for (const node of order) {
        ctx.strokeStyle = COLORS[node.index]; ctx.lineWidth = node.sign > 0 ? 2 : 1.5;
        ctx.globalAlpha = node.sign > 0 ? .85 : .45;
        ctx.beginPath(); ctx.moveTo(size / 2, size / 2); ctx.lineTo(node.anchorX, node.anchorY); ctx.stroke();
        ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(node.anchorX, node.anchorY); ctx.lineTo(node.x, node.y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1; ctx.font = '600 11px ' + palette.font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const node of order) {
        const button = buttons[nodes.indexOf(node)], active = button === hover || button === focused;
        ctx.beginPath(); ctx.arc(node.x, node.y, RADIUS - 1, 0, Math.PI * 2);
        ctx.fillStyle = node.sign > 0 ? COLORS[node.index] : palette.background; ctx.fill();
        ctx.strokeStyle = COLORS[node.index]; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = node.sign > 0 ? '#ffffff' : palette.foreground;
        ctx.fillText((node.sign < 0 ? '−' : '') + node.axis.toUpperCase(), node.x, node.y + .5);
        if (active || node.depth > .99999) {
          ctx.beginPath(); ctx.arc(node.x, node.y, RADIUS + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = active ? palette.foreground : COLORS[node.index]; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      texture.needsUpdate = true; dirty = false;
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
      // OrbitControls can drift by floating-point epsilons at the poles. Avoid
      // rerasterizing/uploading this texture for subpixel changes while idle.
      const pose = viewCamera.quaternion.toArray().map(v => v.toFixed(6)).join(',') + '/' + size;
      if (pose !== lastPose) {
        nodes = projectEndpoints(THREE, viewCamera.quaternion, size); lastPose = pose; dirty = true;
        nodes.forEach((node, i) => {
          Object.assign(buttons[i].style, { left: (node.x - RADIUS) + 'px', top: (node.y - RADIUS) + 'px' });
          if (node.depth > .99999) buttons[i].setAttribute('aria-current', 'true');
          else buttons[i].removeAttribute('aria-current');
        });
      }
      if (dirty) draw(size);
      return true;
    }
    return Object.freeze({ scene, camera, update });
  }
  global.VibeMolAxisGizmo = Object.freeze({ create, projectEndpoints });
})(typeof window !== 'undefined' ? window : globalThis);
