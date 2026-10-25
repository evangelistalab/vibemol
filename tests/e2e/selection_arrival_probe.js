/* Measurement only. Observe the existing setter; never set or repair selection. */
(function (global) {
  'use strict';
  const now = performance.now.bind(performance);
  const events = [], errors = [], longTasks = [];
  let current = null, installed = 0, constructors = 0, dropped = 0;
  const copy = value => Array.isArray(value) ? value.slice() : value;
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function observe(fn) { try { fn(); } catch (error) { errors.push(String(error)); } }
  function record(kind, values = {}) {
    if (events.length >= 4096) { dropped++; return; }
    events.push({kind, at: now(), ...values});
  }
  let observer = null;
  observe(() => {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTasks.push({start: entry.startTime, duration: entry.duration});
      if (longTasks.length > 2048) longTasks.splice(0, longTasks.length - 2048);
    });
    observer.observe({type: 'longtask', buffered: true});
  });
  const publicSelection = () => copy(global.VibeMolTesting?.getEditSelectionIndices?.());
  function observeState(state) {
    const original = Object.getOwnPropertyDescriptor(state, 'editAtomSelectionIndices');
    if (!original?.get || !original?.set || !original.configurable) throw new Error('Authoritative selection accessor unavailable');
    Object.defineProperty(state, 'editAtomSelectionIndices', {...original, set(value) {
      if (!current || current.closed) return Reflect.apply(original.set, this, [value]);
      const lower = now();
      // Preserve this, value identity, return/throw behavior and original ordering.
      const result = Reflect.apply(original.set, this, [value]);
      const upper = now();
      if (current && !current.closed) observe(() => {
        const actual = copy(Reflect.apply(original.get, this, []));
        const exposed = publicSelection();
        const row = {lower, upper, actual, exposed, expected: current.expected};
        record('selection-write', row);
        if (equal(actual, current.expected) && equal(exposed, current.expected) && !current.arrival) {
          current.arrival = {...row, stack: new Error('selection arrival').stack};
          if (current.resolveArrival) current.resolveArrival();
        }
      });
      return result;
    }});
    installed++;
  }
  Object.defineProperty(global, 'VibeMolEditTools', {configurable: true, enumerable: true, set(exports) {
    const original = exports.createEditToolsController;
    const replacement = Object.freeze({...exports, createEditToolsController(options = {}) {
      constructors++;
      observe(() => observeState(options.state));
      const callback = typeof options.onSelectionChanged === 'function' ? options.onSelectionChanged : (() => {});
      const wrappedOptions = {...options, onSelectionChanged(...args) {
        if (!current || current.closed) return Reflect.apply(callback, this, args);
        const begin = now();
        let completed = false;
        try {
          const value = Reflect.apply(callback, this, args);
          completed = true;
          return value;
        } finally {
          if (current && !current.closed) observe(() => record('selection-callback', {begin, end: now(), completed}));
        }
      }};
      return Reflect.apply(original, this, [wrappedOptions]);
    }});
    Object.defineProperty(global, 'VibeMolEditTools', {value: replacement, writable: true, configurable: true, enumerable: true});
  }});
  for (const type of ['pointerdown', 'pointerup', 'click', 'gotpointercapture', 'lostpointercapture']) {
    for (const capture of [true, false]) global.addEventListener(type, event => {
      if (!current || current.closed) return;
      observe(() => record('native-event', {type, phase: capture ? 'capture' : 'bubble',
        eventTimeStamp: event.timeStamp, target: event.target?.id || event.target?.className,
        x: event.clientX, y: event.clientY, pointerId: event.pointerId,
        selection: publicSelection(), shift: event.shiftKey,
        transform: global.VibeMolTesting?.getActiveTransformGesture?.()}));
    }, capture);
  }
  function frame(at) {
    if (!current || current.closed) return;
    observe(() => record('frame', {frameAt: at, selection: publicSelection()}));
    requestAnimationFrame(frame);
  }
  function snapshot() {
    observe(() => {
      for (const entry of observer?.takeRecords() || []) longTasks.push({start: entry.startTime, duration: entry.duration});
    });
    const end = now();
    return {current: current && {...current, resolveArrival: undefined}, events: events.slice(), errors: errors.slice(),
      longTasks: longTasks.filter(t => t.start + t.duration >= (current?.armedAt ?? end) && t.start <= end),
      installed, constructors, dropped, readbackAt: end, readback: publicSelection(),
      visibility: document.visibilityState, hasFocus: document.hasFocus(), timeOrigin: performance.timeOrigin};
  }
  global.__selectionArrival = {
    arm(expected, point) {
      if (current) throw new Error('Arrival probe is single activation, never an automatic retry');
      events.length = 0;
      current = {armedAt: now(), expected: copy(expected), point, arrival: null, closed: false,
        initial: publicSelection(), initiallySatisfied: equal(publicSelection(), expected)};
      requestAnimationFrame(frame);
      return {armedAt: current.armedAt, initial: current.initial, initiallySatisfied: current.initiallySatisfied};
    },
    poll(actual) {
      if (current && !current.closed) observe(() => record('wait-poll', {actual, selection: publicSelection(), expected: current.expected}));
      return actual;
    },
    async finish(collectionCeilingMs) {
      // This extra observation window never turns the preserved600ms assertion
      // into a pass. It records a late arrival or an explicitly missing receipt.
      if (current && !current.arrival) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, collectionCeilingMs);
          current.resolveArrival = () => { clearTimeout(timer); resolve(); };
        });
      }
      const value = snapshot();
      if (current) current.closed = true;
      return value;
    },
    snapshot,
  };
})(window);
