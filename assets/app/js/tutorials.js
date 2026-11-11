(function () {
  'use strict';

  const panel = (id, control, tab) => ({ panel: id, control, tab });
  const click = selector => ({ type: 'click', selector });
  const change = selector => ({ type: 'change', selector });
  const canvas = { control: '#canvas' };
  const objectTab = '#inspectorObjectTab';
  const lookTab = '#inspectorLookTab';
  const appleKeyboard = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform);
  const key = (label, spoken = label) => ({ label, spoken });
  const clipboardKey = letter => key(`${appleKeyboard ? '⌘' : 'Ctrl'}+${letter}`,
    `${appleKeyboard ? 'Command' : 'Control'} plus ${letter}`);

  const water = {
    title: 'Explore and measure water',
    sample: { name: 'Tutorial water.xyz', path: 'assets/fragments/water.xyz' },
    atomChoices: [{ index: 0, label: 'Oxygen 1' }, { index: 1, label: 'Hydrogen 2' }, { index: 2, label: 'Hydrogen 3' }],
    nextAtoms: last => last === 0 ? [1, 2] : [0],
    finish: {
      title: 'Distance recorded',
      text: result => `You measured ${result.text}. Find the same value on the molecule and in Measurements.`,
      target: panel('measurementsPanel', 'tbody tr'),
    },
    steps: [
      {
        title: 'Load water',
        phases: [{
          text: 'Open a water molecule in a practice scene.',
          action: 'Load water',
          load: true,
        }],
      },
      {
        title: 'Navigate the view',
        phases: [
          {
            text: 'Drag with the left mouse button or one finger to orbit. You can also choose a direction on the axis gizmo.',
            target: canvas,
            gesture: 'orbit',
            mode: 'viewing',
          },
          {
            text: 'Hold the right mouse button and drag to pan the scene. Scroll to zoom if you like.',
            target: canvas,
            gesture: 'pan',
            mode: 'viewing',
            action: 'Continue without panning',
          },
        ],
      },
      {
        title: 'Reset the camera',
        phases: [{
          text: 'Open Camera from Panels, then choose Reset View.',
          target: panel('viewPanel', '#viewReset'),
          events: [click('#viewReset')],
        }],
      },
      {
        title: 'Properties · Object',
        phases: [
          {
            text: 'Select the practice molecule in Scenes to see its properties.',
            target: { molecule: true },
            ready: ({ scene }) => scene.selected,
          },
          {
            text: 'Open Properties and choose Object. Find the formula and electron count, then try the Atom labels switch.',
            target: panel('inspector', '#inspectorShowAtomLabels', objectTab),
            events: [change('#inspectorShowAtomLabels')],
          },
        ],
      },
      {
        title: 'Properties · Look',
        phases: [
          {
            text: 'Choose Look, then try a different Style or select a preview tile. Look changes apply across the workspace.',
            target: panel('inspector', '#lookPreset', lookTab),
            events: [change('#lookPreset'), click('#lookGallery button[data-look]')],
            accepted: () => !document.getElementById('lookUndo').disabled,
          },
          {
            text: 'Choose Undo to restore the appearance you started with.',
            target: panel('inspector', '#lookUndo', lookTab),
            events: [click('#lookUndo')],
            accepted: () => document.getElementById('lookUndo').disabled,
          },
        ],
      },
      {
        title: 'Read the coordinates',
        phases: [
          {
            text: ['Open Coordinates from Panels or press ', key('C'), '. Match the oxygen and hydrogens to their rows, then switch units.'],
            target: panel('coordsPanel', '#coordsUnitsBtn'),
            events: [click('#coordsUnitsBtn')],
          },
          {
            text: 'Switch the coordinate units back.',
            target: panel('coordsPanel', '#coordsUnitsBtn'),
            events: [click('#coordsUnitsBtn')],
          },
        ],
      },
      {
        title: 'Copy and paste XYZ',
        phases: [{
          text: ['With the canvas focused, press ', clipboardKey('C'), ' or use Copy in Coordinates. Paste into the box with ',
            clipboardKey('V'), ' or touch and hold to paste.'],
          target: panel('coordsPanel', '#copyXYZ'),
          mode: 'viewing',
          action: 'Skip clipboard practice',
          exercise: {
            label: 'Paste water XYZ here',
            matches: (value, app) => value.trim() === app.xyz().trim(),
            success: ['You copied the water’s three XYZ rows in Å. To open XYZ as a new structure, focus the canvas and press ', clipboardKey('V'), '.'],
            mismatch: 'Copy the practice molecule’s XYZ and paste it here again.',
          },
        }],
      },
      {
        title: 'Measure a distance',
        phases: [
          {
            text: ['Choose Measure or press ', key('M'), '.'],
            target: { control: '#modeMeasureBtn' },
            ready: ({ scene }) => scene.measuring,
          },
          {
            text: 'Select the red oxygen and either white hydrogen.',
            target: { atom: true },
            mode: 'measuring',
            result: rows => rows.find(row => row.type === 'distance' && row.value !== null &&
              row.indices.includes(0) && row.indices.some(index => index === 1 || index === 2)),
          },
        ],
      },
    ],
  };

  function visibleBounds(element) {
    if (!element || element.closest('[hidden], [aria-hidden="true"], [data-wb-hidden="true"]')) return null;
    const rect = element.getBoundingClientRect();
    if (getComputedStyle(element).visibility === 'hidden' || !rect.width || !rect.height) return null;
    const left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  }

  const hitCenter = rect => document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);

  function targetElement(element, region = element) {
    const rect = visibleBounds(element);
    if (!rect) return null;
    const hit = hitCenter(rect);
    if (!element.contains(hit) && !hit?.closest('.vm-tutorial-card')) return null;
    return { element, rect, region: visibleBounds(region) || rect };
  }

  function panelTarget({ panel: id, control, tab }) {
    if (document.body.dataset.wbFocus === 'true') {
      const focus = targetElement(document.getElementById('workbenchFocus')) ||
        targetElement(document.getElementById('workbenchOverflowBtn'));
      return { ...focus, hint: 'Turn off Focus to show your panels.' };
    }
    const item = window.VibeMolWorkbenchModel.catalog.find(entry => entry.id === id);
    const root = document.getElementById(item.panel);
    const region = visibleBounds(root);
    if (region) {
      const tabButton = tab && document.querySelector(tab);
      const element = tabButton && tabButton.getAttribute('aria-selected') !== 'true'
        ? tabButton : root.querySelector(control);
      const target = targetElement(element, root);
      if (target) return target;
      const rect = visibleBounds(element);
      const blocker = rect && hitCenter(rect)?.closest('[data-wb-placement="float"][data-wb-panel]');
      if (blocker && blocker !== root) {
        const covering = window.VibeMolWorkbenchModel.catalog.find(entry => entry.id === blocker.dataset.wbPanel);
        const header = targetElement(blocker.querySelector('.wb-window-header'), blocker);
        return { ...header, hint: `Move or close ${covering.label} to reach ${item.label}.` };
      }
      return { region, hint: element ? `Scroll inside ${item.label} for the next control.` : null };
    }
    const menu = document.getElementById('workbenchPanelsMenu');
    const row = menu.querySelector(`[data-window="${id}"]`);
    const dockTab = document.getElementById('wb-tab-' + id);
    return targetElement(row, menu) || targetElement(dockTab) ||
      (visibleBounds(menu) && row ? { region: visibleBounds(menu), hint: `Scroll the Panels menu to ${item.label}.` }
        : targetElement(document.getElementById('workbenchPanelsBtn')));
  }

  function sceneTarget(id) {
    const row = id && document.querySelector(`#sceneOutlinerBody [data-id="${CSS.escape(id)}"]`);
    return targetElement(row) || targetElement(document.getElementById('toolbarShowBtn'));
  }

  function resolveTarget(target, scene, app, lesson) {
    if (!target) return null;
    if (target.panel) return panelTarget(target);
    if (target.molecule) return sceneTarget(scene.moleculeId || scene.id);
    const surface = document.getElementById('canvas');
    if (target.control === '#canvas') {
      const rect = visibleBounds(surface);
      return { element: surface, rect, region: rect };
    }
    if (!target.atom) return targetElement(document.querySelector(target.control));

    const region = visibleBounds(surface);
    for (const index of lesson.nextAtoms(scene.firstPick)) {
      const point = app.projectAtom(index);
      const hit = point && document.elementFromPoint(point.x, point.y);
      if (hit === surface || hit?.closest('.vm-tutorial-card')) {
        const { x, y } = point;
        return { region, atom: true, rect: { left: x - 19, top: y - 19, right: x + 19, bottom: y + 19 } };
      }
    }
    return { region, atom: true };
  }

  function makeGuide(choices) {
    const root = document.createElement('div');
    root.className = 'vm-tutorial';
    root.innerHTML = `
      <div class="vm-tutorial-shade" aria-hidden="true"></div>
      <div class="vm-tutorial-target" aria-hidden="true"></div>
      <section class="vm-tutorial-card" aria-label="Tutorial" tabindex="-1">
        <div class="vm-tutorial-heading">
          <span class="vm-tutorial-progress"></span>
          <button class="vm-btn vm-btn--ghost" type="button" data-exit>Exit tutorial</button>
        </div>
        <div role="status">
          <h2></h2>
          <p></p>
        </div>
        <label class="vm-tutorial-exercise" hidden>
          <span></span>
          <textarea rows="3" spellcheck="false"></textarea>
        </label>
        <button class="vm-btn" type="button" data-advance hidden></button>
        <details class="vm-tutorial-picks" hidden>
          <summary>Choose atoms from a list</summary>
          <div></div>
        </details>
      </section>`;
    const list = root.querySelector('.vm-tutorial-picks > div');
    for (const { index, label } of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vm-btn';
      button.dataset.atom = index;
      button.textContent = label;
      list.append(button);
    }
    return root;
  }

  function hintParts(text) {
    return Array.isArray(text) ? text : [text];
  }

  function renderHint(element, text) {
    element.replaceChildren(...hintParts(text).map(part => {
      if (typeof part === 'string') return part;
      const badge = document.createElement('kbd');
      badge.className = 'vm-key-pill';
      badge.textContent = part.label;
      badge.setAttribute('aria-label', part.spoken);
      return badge;
    }));
  }

  function boundsStyle(element, rect) {
    element.hidden = !rect;
    if (!rect) return;
    const width = rect.right - rect.left, height = rect.bottom - rect.top;
    const css = `left:${rect.left}px;top:${rect.top}px;width:${width}px;height:${height}px`;
    if (element.getAttribute('style') !== css) element.setAttribute('style', css);
  }

  function positionCard(card, target) {
    const bar = document.getElementById('workbenchBar');
    const top = Math.max(8, (bar?.getBoundingClientRect().bottom || 0) + 8);
    const { width, height } = card.getBoundingClientRect();
    const right = Math.max(8, innerWidth - width - 8);
    const bottom = Math.max(8, innerHeight - height - 8);
    const left = Math.max(8, (bar?.getBoundingClientRect().left || 0) + 8);
    const candidates = [[left, top], [right, top], [left, bottom], [right, bottom]];
    const overlap = ([x, y], rect) => rect
      ? Math.max(0, Math.min(x + width, rect.right) - Math.max(x, rect.left)) *
        Math.max(0, Math.min(y + height, rect.bottom) - Math.max(y, rect.top))
      : 0;
    const cost = point => {
      if (target?.element?.id === 'canvas') return 0;
      return overlap(point, target?.rect) * 4 + (target?.atom ? 0 : overlap(point, target?.region));
    };
    const [x, y] = candidates.reduce((best, point) => cost(point) < cost(best) ? point : best);
    const css = `left:${x}px;top:${Math.min(y, bottom)}px`;
    if (card.getAttribute('style') !== css) card.setAttribute('style', css);
  }

  function startLesson(lesson, app, source, onClose) {
    const abort = new AbortController();
    const { signal } = abort;
    const root = makeGuide(lesson.atomChoices || []);
    const card = root.querySelector('.vm-tutorial-card');
    const shade = root.querySelector('.vm-tutorial-shade');
    const marker = root.querySelector('.vm-tutorial-target');
    const advance = root.querySelector('[data-advance]');
    const picks = root.querySelector('.vm-tutorial-picks');
    const exercise = root.querySelector('.vm-tutorial-exercise');
    const exerciseInput = exercise.querySelector('textarea');
    const surface = document.getElementById('canvas');
    let stepIndex = 0, phaseIndex = 0, sceneId = null, frame = 0, lastDisplay = '';
    let gesture = null, busy = false, error = '', result = null, finished = false;
    let previousTarget = null, previousPhase = null;
    let exercisePassed = false;

    const phase = () => lesson.steps[stepIndex].phases[phaseIndex];

    function close() {
      abort.abort();
      cancelAnimationFrame(frame);
      root.remove();
      if (visibleBounds(source)) source.focus({ preventScroll: true });
      else surface.focus({ preventScroll: true });
      onClose();
    }

    function next() {
      gesture = null;
      exerciseInput.value = '';
      exercisePassed = false;
      if (phaseIndex + 1 < lesson.steps[stepIndex].phases.length) phaseIndex++;
      else if (stepIndex + 1 < lesson.steps.length) {
        stepIndex++;
        phaseIndex = 0;
      } else finished = true;
    }

    function present(title, text, action, chooseAtoms, exerciseLabel) {
      const display = JSON.stringify([title, text, action, chooseAtoms, exerciseLabel, busy, stepIndex, finished]);
      if (display === lastDisplay) return;
      lastDisplay = display;
      root.querySelector('.vm-tutorial-progress').textContent = finished
        ? lesson.title : `${stepIndex + 1} of ${lesson.steps.length} · ${lesson.title}`;
      root.querySelector('h2').textContent = title;
      renderHint(root.querySelector('p'), text);
      advance.hidden = !action;
      advance.textContent = action || '';
      advance.disabled = busy;
      picks.hidden = !chooseAtoms;
      exercise.hidden = !exerciseLabel;
      exercise.querySelector('span').textContent = exerciseLabel || '';
    }

    function highlight(target, current) {
      if (current !== previousPhase || (target?.element || null) !== previousTarget) {
        previousPhase = current;
        previousTarget = target?.element || null;
        marker.replaceChildren(document.createElement('span'));
      }
      const rect = target?.rect;
      marker.classList.toggle('vm-tutorial-target--atom', !!target?.atom);
      boundsStyle(marker, rect);
      // The canvas itself stays clear during camera gestures and atom picking.
      boundsStyle(shade, target?.region);
      positionCard(card, target);
    }

    function tick() {
      const current = phase();
      const scene = app.scene();
      let target = null;
      if (finished) {
        present(lesson.finish.title, lesson.finish.text(result), 'Finish', false);
        if (scene.id === sceneId) target = resolveTarget(lesson.finish.target, scene, app, lesson);
      } else if (sceneId && !app.hasScene(sceneId)) {
        present('Practice scene removed', 'Start again to reload the practice sample.', 'Start again', false);
      } else if (sceneId && scene.id !== sceneId) {
        present('Return to the practice scene', `Select ${lesson.sample.name} in Scenes to continue.`, null, false);
        target = sceneTarget(sceneId);
      } else if (current.mode && !scene[current.mode]) {
        const viewing = current.mode === 'viewing';
        present(lesson.steps[stepIndex].title,
          ['Choose ', viewing ? 'View' : 'Measure', ' or press ', key(viewing ? 'V' : 'M'), '.'], null, false);
        target = resolveTarget({ control: viewing ? '#modeDisplayBtn' : '#modeMeasureBtn' }, scene, app, lesson);
      } else {
        target = resolveTarget(current.target, scene, app, lesson);
        if (current.result) result = current.result(app.measurements());
        if (result || current.ready?.({ scene })) {
          next();
        } else {
          const text = hintParts(error || (exercisePassed ? current.exercise.success : current.text));
          const note = !exercisePassed && exerciseInput.value.trim() && current.exercise?.mismatch;
          present(lesson.steps[stepIndex].title, [...text, ...[target?.hint, note].filter(Boolean).map(hint => ` ${hint}`)],
            busy ? 'Loading sample…' : error ? 'Retry' : exercisePassed ? 'Continue' : current.action,
            !!current.result && !!lesson.atomChoices?.length, current.exercise?.label);
        }
      }
      highlight(target, current);
      frame = requestAnimationFrame(tick);
    }

    async function load() {
      busy = true;
      error = '';
      try {
        const id = await app.load(lesson.sample, signal);
        if (signal.aborted) return;
        if (!id) throw new Error('The practice scene did not open');
        sceneId = id;
        next();
      } catch (failure) {
        if (!signal.aborted) error = `Could not load the sample. ${failure.message}`;
      } finally {
        busy = false;
      }
    }

    function acceptsInput() {
      if (finished || !sceneId) return false;
      const scene = app.scene();
      return scene.id === sceneId && (!phase().mode || scene[phase().mode]);
    }

    function observeAction(event) {
      if (!acceptsInput()) return;
      const current = phase();
      const action = current.events?.some(({ type, selector }) => type === event.type && event.target.closest(selector));
      const axis = current.gesture === 'orbit' && event.type === 'click' && event.target.closest('#axisGizmo button');
      if (!action && !axis) return;
      const before = axis ? app.pose() : null;
      // Observe the state after the native event and its app handlers finish.
      requestAnimationFrame(() => {
        if (signal.aborted || event.defaultPrevented || current !== phase() || !acceptsInput()) return;
        if (current.accepted && !current.accepted()) return;
        if (!axis || cameraChanged('orbit', before, app.pose())) next();
      });
    }

    surface.addEventListener('pointerdown', event => {
      if (!acceptsInput()) return;
      const kind = event.button === 2 ? 'pan' : event.button === 0 ? 'orbit' : null;
      if (kind && phase().gesture === kind) gesture = { kind, pointer: event.pointerId, before: app.pose() };
    }, { capture: true, signal });
    document.addEventListener('pointerup', event => {
      if (gesture?.pointer !== event.pointerId) return;
      const { kind, before } = gesture;
      gesture = null;
      requestAnimationFrame(() => {
        if (!signal.aborted && acceptsInput() && phase().gesture === kind && cameraChanged(kind, before, app.pose())) next();
      });
    }, { capture: true, signal });
    document.addEventListener('pointercancel', event => {
      if (gesture?.pointer === event.pointerId) gesture = null;
    }, { capture: true, signal });
    for (const type of ['click', 'change']) document.addEventListener(type, observeAction, { capture: true, signal });
    root.querySelector('[data-exit]').addEventListener('click', close);
    exerciseInput.addEventListener('input', () => {
      exercisePassed = !!(exerciseInput.value.trim() && phase().exercise?.matches(exerciseInput.value, app));
    });
    advance.addEventListener('click', () => {
      if (busy) return;
      if (finished) close();
      else if (sceneId && !app.hasScene(sceneId)) {
        sceneId = null;
        result = null;
        exerciseInput.value = '';
        exercisePassed = false;
        stepIndex = 0;
        phaseIndex = 0;
      } else if (phase().load) void load();
      else if (acceptsInput() && phase().action) next();
    });
    picks.addEventListener('click', event => {
      const button = event.target.closest('[data-atom]');
      if (button && phase().result && acceptsInput()) app.pickAtom(sceneId, Number(button.dataset.atom));
    });

    document.body.append(root);
    card.focus({ preventScroll: true });
    tick();
    return card;
  }

  function cameraChanged(kind, before, after) {
    if (kind === 'pan') return Math.hypot(...after.target.map((value, i) => value - before.target[i])) > 1e-5;
    const dot = before.rotation.reduce((sum, value, i) => sum + value * after.rotation[i], 0);
    return Math.abs(dot) < 1 - 1e-6;
  }

  document.addEventListener('vm-tutorial-ready', event => {
    const app = event.detail;
    let card = null;
    for (const [parent, label] of [
      ['#emptyStatePrimaryAction', 'Try the water tutorial'],
      ['.vm-helpOverlayContent', 'Start water tutorial'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vm-btn vm-tutorial-start';
      button.textContent = label;
      button.addEventListener('click', () => {
        app.closeHelp();
        if (card) card.focus({ preventScroll: true });
        else card = startLesson(water, app, button, () => { card = null; });
      });
      document.querySelector(parent).append(button);
    }
  }, { once: true });
})();
