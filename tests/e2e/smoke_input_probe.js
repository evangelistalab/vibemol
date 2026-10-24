/* Diagnostic only: observe input without cancelling, retargeting or repairing it. */
(() => {
  const now = performance.now.bind(performance);
  const rows = [], captures = new Map(), pointers = new Map();
  let scope = {}, sequence = 0, dropped = 0;
  const stamp = () => ({at: now(), epoch: performance.timeOrigin + now(), appAt: performance.now()});
  const node = el => el ? {tag: el.tagName, id: el.id || '', classes: String(el.className || '')} : null;
  function state() {
    const canvas = document.getElementById('canvas'), api = window.VibeMolTesting;
    return {canvasClass: canvas?.className, activeModes: [...document.querySelectorAll('#modeDisplayBtn.active,#modeMeasureBtn.active,#modeEditBtn.active,#modeCalculationsBtn.active')].map(el => el.id),
      selection: api?.getEditSelectionIndices?.(), fusePreview: api?.isFuseRingPreviewActive?.(),
      focus: node(document.activeElement), pointerLock: node(document.pointerLockElement),
      documentVisibility:document.visibilityState, documentHasFocus:document.hasFocus(),
      pointerCapture: [...captures.entries()], downPointers: [...pointers.entries()],
      canvasCapture:[...new Set([...captures.keys(),...pointers.keys()])].map(id=>({id,captured:canvas?.hasPointerCapture(id)})),
      clockHeld: !!window.__videoClockGate?.held};
  }
  function record(kind, data = {}) {
    if (rows.length === 10000) { rows.shift(); dropped++; }
    const row = {sequence: ++sequence, ...stamp(), scope: {...scope}, kind, ...data};
    rows.push(row); return row;
  }
  const observe = phase => event => {
    if (event.type === 'gotpointercapture') captures.set(event.pointerId, node(event.target));
    if (event.type === 'lostpointercapture') captures.delete(event.pointerId);
    if (event.type === 'pointerdown') pointers.set(event.pointerId, {buttons: event.buttons, target: node(event.target)});
    if (event.type === 'pointerup' || event.type === 'pointercancel') pointers.delete(event.pointerId);
    if (event.type === 'pointermove' && !event.buttons) return;
    const detail = {phase, type: event.type, target: node(event.target), path: event.composedPath().slice(0,8).map(node),
      x: event.clientX, y: event.clientY, pointerId: event.pointerId, button: event.button, buttons: event.buttons,
      pointerType:event.pointerType, primary:event.isPrimary, detail:event.detail,
      key: event.key, repeat: event.repeat, defaultPrevented: event.defaultPrevented,
      eventTimeStamp: event.timeStamp, state: state()};
    const row = record('native-event', detail);
    // A later task is labelled as such, never presented as the event-time state.
    if (phase === 'capture' && ['pointerdown','pointerup','click','pointercancel'].includes(event.type)) {
      setTimeout(() => record('post-event-task', {eventSequence: row.sequence, type: event.type, state: state()}), 0);
    }
  };
  for (const type of ['pointerdown','pointerup','pointermove','pointercancel','gotpointercapture','lostpointercapture','click','keydown','keyup']) {
    window.addEventListener(type, observe('capture'), true);
    window.addEventListener(type, observe('bubble'), false);
  }
  function describe(el, point) {
    if (!el) return null;
    const r = el.getBoundingClientRect(), css = getComputedStyle(el);
    const x = point?.x ?? (r.x + r.width/2), y = point?.y ?? (r.y + r.height/2);
    return {...node(el), hidden: el.hidden, disabled: el.disabled, ariaHidden: el.getAttribute('aria-hidden'),
      mode: el.dataset.state, display: css.display, visibility: css.visibility, pointerEvents: css.pointerEvents,
      zIndex: css.zIndex, rect: {x:r.x,y:r.y,width:r.width,height:r.height},
      point:{x,y}, hitStack: document.elementsFromPoint(x,y).slice(0,8).map(node),
      hitIsSelf: el.contains(document.elementFromPoint(x,y)), value: el.value};
  }
  function snapshot(point) {
    const api=window.VibeMolTesting, canvas=document.getElementById('canvas'), button=document.getElementById('editAdaptiveAddAtomBtn');
    const ancestors=[]; for(let el=button?.parentElement;el&&ancestors.length<6;el=el.parentElement)ancestors.push(describe(el));
    return {...stamp(), ...state(), scroll:{x:scrollX,y:scrollY}, viewport:{width:innerWidth,height:innerHeight},
      canvas:describe(canvas,point), buildButton:describe(button), buildAncestors:ancestors,
      buildPopover:describe(document.getElementById('editAdaptiveAddAtomPopover')),
      buildState:api?.getEditBuildState?.(), camera:api?.getCameraSnapshot?.(),
      pick:point ? api?.pickEditHitAtClient?.(point.x,point.y) : null,
      hint:document.getElementById('hint')?.textContent, lastWait:window.__smokeRegionLastWait || null};
  }
  window.__smokeInputProbe = {
    scope(value) { scope={...value}; }, snapshot,
    mark(kind,data) { return record(kind,{...data,state:state()}); },
    take() { const data={rows:rows.splice(0),dropped,documentTimeOrigin:performance.timeOrigin};return data; }
  };
})();
