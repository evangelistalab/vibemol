(function (config, read, observeStalls) {
  const now = performance.now.bind(performance);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const state = {contract: 'shared-assertion', mode: config.mode, label: config.label,
    expected: config.expected, site: config.site, budgetMs: config.budgetMs,
    hardWallMs: config.hardWallMs, received: false, complete: false,
    initial: null, actual: null, current: null, error: null};
  let timer = null, observer = null, budget = null;
  const stalls = observeStalls();
  function value() {
    try {
      const actual = read(config.arg);
      if (actual && typeof actual.then === 'function') throw new Error('State readers must return a synchronous value, never a Promise');
      return actual;
    } catch (error) { state.error = String(error); return null; }
  }
  state.initial = value();
  function row() {
    state.current = value();
    const elapsed = state.observedAt == null ? null : state.observedAt - state.eventTimestamp;
    const timing = budget?.sample(state.observedAt) || null;
    return {...state, stalls: timing, elapsedMs: elapsed, passed: state.received && state.complete
      && state.targetMatches && state.trusted && !state.error && state.via !== 'deadline'
      && same(state.actual,config.expected) && same(state.current,config.expected)
      && Number.isFinite(elapsed) && elapsed >= 0 && timing.withinBudget
      && (!config.requireTransition || !same(state.initial,config.expected))};
  }
  function dispose() {
    stalls.dispose(); clearTimeout(timer); observer?.disconnect();
    window.removeEventListener(config.event, capture, true);
    window.removeEventListener(config.event, bubble, false);
  }
  function finish(via, actual) {
    if (state.complete) return;
    state.complete = true; state.actual = actual; state.observedAt = now(); state.via = via;
    if (via === 'deadline') state.deadlineSample = {observedAtMs: state.observedAt,
      scheduledAtMs: state.eventTimestamp + config.budgetMs,
      latenessMs: state.observedAt - state.eventTimestamp - config.budgetMs, actual};
    clearTimeout(timer); observer?.disconnect();
  }
  function check(via) {
    if (!state.received || state.complete) return;
    const actual = value(), timing = budget.sample();
    if (!timing.withinBudget) finish('deadline',actual);
    else if (state.error || same(actual,config.expected)) finish(via,actual);
  }
  function tick() {
    // Timer observes timing only. Async acceptance still requires native-event
    // completion or a DOM mutation; polling must not invent an arrival event.
    if (!budget.sample().withinBudget) finish('deadline',value());
    if (!state.complete) timer = setTimeout(tick,50);
  }
  function matches(event) {
    return !config.key || (String(event.key).toLowerCase() === config.key && (event.ctrlKey || event.metaKey));
  }
  function capture(event) {
    if (!matches(event) || state.received) return;
    state.received = true; state.eventTimestamp = event.timeStamp; state.captureAt = now();
    state.target = event.target?.id || event.target?.tagName;
    state.targetMatches = !config.selector || !!event.target?.closest?.(config.selector);
    state.trusted = event.isTrusted;
    budget = stalls.budget(state.eventTimestamp,config.budgetMs,config.hardWallMs);
    if (config.mode === 'event-dom') timer = setTimeout(tick,Math.min(50,config.budgetMs));
  }
  function bubble(event) {
    if (!matches(event) || !state.received || state.complete) return;
    // Wrong native completion fails immediately. Never poll for a later repair.
    if (config.mode === 'native') finish('completed native event',value());
    else check('native event');
  }
  if (config.mode === 'event-dom') {
    observer = new MutationObserver(() => check('DOM mutation'));
    observer.observe(document.documentElement,{subtree:true,attributes:true,childList:true,characterData:true});
  }
  window.addEventListener(config.event,capture,true);
  window.addEventListener(config.event,bubble,false);
  return {dispose, snapshot: row, get complete() {return state.complete;}, get received() {return state.received;}};
})
