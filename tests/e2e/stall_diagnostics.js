(function (platform = {}) {
  // #43 confirmed limitation: this is NOT a performance-regression detector.
  // Long tasks and missed heartbeats include the page's OWN awaited CPU work,
  // which receives the same credit as descheduling. A correct slow result can
  // therefore pass until the independent180s ceiling. Wrong/missing values and
  // that ceiling remain protected; uncredited time can still expire the nominal
  // budget. Never interpret a passing responsive duration as performance proof.
  // Raw wall durations/distributions are retained separately; no drift gate.
  // Shared timing owner. Unavailable observations never grant unobserved time.
  const now = platform.now || performance.now.bind(performance);
  const schedule = platform.setTimeout || setTimeout;
  const cancel = platform.clearTimeout || clearTimeout;
  const Observer = platform.PerformanceObserver || globalThis.PerformanceObserver;
  const heartbeatMs = 50, capacity = 4096;
  const startedAtMs = now(), longTasks = [], heartbeatGaps = [];
  let taskObserver = null, observerError = null, droppedLongTasks = 0;
  let heartbeatTimer = null, heartbeatDueAtMs = startedAtMs + heartbeatMs;
  let droppedHeartbeatGaps = 0, disposed = false;
  const collect = entries => {
    for (const e of entries) {
      if (e.startTime + e.duration < startedAtMs) continue;
      if (longTasks.length < capacity) longTasks.push({startTime: e.startTime,
        duration: e.duration, name: e.name, entryType: e.entryType});
      else droppedLongTasks++;
    }
  };
  try {
    if (!Observer?.supportedEntryTypes?.includes('longtask')) {
      throw new Error('PerformanceObserver longtask entries are unavailable');
    }
    taskObserver = new Observer(list => collect(list.getEntries()));
    taskObserver.observe({type: 'longtask', buffered: true});
  } catch (error) { observerError = String(error); }
  function heartbeat() {
    const observedAtMs = now();
    if (observedAtMs > heartbeatDueAtMs) {
      const gap = {startTime: heartbeatDueAtMs, duration: observedAtMs - heartbeatDueAtMs,
        observedAtMs, provisional: false};
      if (heartbeatGaps.length < capacity) heartbeatGaps.push(gap);
      else droppedHeartbeatGaps++;
    }
    heartbeatDueAtMs = observedAtMs + heartbeatMs;
    if (!disposed) heartbeatTimer = schedule(heartbeat, heartbeatMs);
  }
  heartbeatTimer = schedule(heartbeat, heartbeatMs);
  function flush() {
    if (taskObserver) {
      try { collect(taskObserver.takeRecords()); }
      catch (error) { observerError = String(error); }
    }
  }
  function union(entries, start, end) {
    const intervals = entries.map(e => [Math.max(start, e.startTime),
      Math.min(end, e.startTime + e.duration)]).filter(([a,b]) => b > a)
      .sort((a,b) => a[0]-b[0]);
    let duration = 0, previousEnd = -Infinity;
    for (const [a,b] of intervals) {
      duration += Math.max(0,b-Math.max(a,previousEnd));
      previousEnd = Math.max(previousEnd,b);
    }
    return duration;
  }
  function sample(input) {
    flush();
    const readbackAtMs = now(), end = input.completedAtMs ?? readbackAtMs;
    const start = input.startedAtMs;
    const wait = Number.isFinite(start) ? {startedAtMs: start, timeoutMs: input.timeoutMs,
      deadlineAtMs: start + input.timeoutMs} : null;
    // A budget callback may precede the overdue heartbeat after a stall.
    // Count its pending interval now, independently of callback ordering.
    const gaps = heartbeatGaps.slice();
    if (!disposed && readbackAtMs > heartbeatDueAtMs) gaps.push({startTime: heartbeatDueAtMs,
      duration: readbackAtMs-heartbeatDueAtMs, observedAtMs: readbackAtMs, provisional: true});
    const validWindow = !!wait && start >= startedAtMs && end >= start;
    const longTaskOverlapMs = validWindow ? union(longTasks,start,end) : 0;
    const heartbeatGapOverlapMs = validWindow ? union(gaps,start,end) : 0;
    // Lost records fail conservatively: retained evidence explains the failure,
    // but incomplete coverage cannot buy more time.
    const discountAvailable = validWindow && !droppedLongTasks && !droppedHeartbeatGaps;
    const observedUnionMs = validWindow ? union([...longTasks,...gaps],start,end) : 0;
    const discountedMs = discountAvailable ? observedUnionMs : 0;
    const wallElapsedMs = wait ? Math.max(0,end-start) : null;
    return {preludeStartedAtMs: startedAtMs, wait, observedWaitEndAtMs: end,
      deadlineSample: input.deadlineSample || null, readback: {observedAtMs: readbackAtMs},
      readbackAfterDeadlineMs: wait ? readbackAtMs-wait.deadlineAtMs : null,
      longTasks: longTasks.slice(), heartbeatGaps: gaps, heartbeatMs,
      longTasksCrossingDeadline: wait ? longTasks.filter(e => e.startTime < wait.deadlineAtMs
        && e.startTime + e.duration >= wait.deadlineAtMs) : [],
      longTasksOverlappingWait: validWindow ? longTasks.filter(e => e.startTime < end
        && e.startTime + e.duration > start) : [],
      longTaskOverlapMs: wait ? longTaskOverlapMs : null,
      heartbeatGapOverlapMs: wait ? heartbeatGapOverlapMs : null, observedUnionMs, discountedMs,
      wallElapsedMs, responsiveElapsedMs: wait ? Math.max(0,wallElapsedMs-discountedMs) : null,
      discountAvailable, fallback: !discountAvailable ? 'Charge all wall time: invalid window or dropped observations'
        : observerError ? 'Long-task observer unavailable: discount retained known intervals and heartbeat evidence only' : null,
      hadLongTaskOverlap: longTaskOverlapMs > 0 ? true : validWindow && !observerError
        && !droppedLongTasks ? false : null,
      droppedLongTasks, droppedHeartbeatGaps, observerError,
      waitStartedBeforeObserver: wait ? start < startedAtMs : null,
      samplingCaveat: 'Discount the union of observed wait-overlapping long tasks and overdue monotonic-heartbeat intervals once. Prelude is excluded. Pending overdue intervals count before their callbacks run. Late snapshots use actual timestamps, never the nominal deadline.'};
  }
  function budget(start, responsiveBudgetMs, hardWallMs) {
    if (![start,responsiveBudgetMs,hardWallMs].every(Number.isFinite)
        || start < startedAtMs || responsiveBudgetMs <= 0 || hardWallMs < responsiveBudgetMs) {
      throw new Error('Invalid responsive budget/window');
    }
    let result=null;
    const clock={sample(completedAtMs) {
      const row = sample({startedAtMs: start,timeoutMs: responsiveBudgetMs,completedAtMs});
      const hardWallExceeded = row.wallElapsedMs > hardWallMs;
      const responsiveExceeded = row.responsiveElapsedMs > responsiveBudgetMs;
      return {...row, responsiveBudgetMs, hardWallMs, hardWallDeadlineAtMs: start+hardWallMs,
        hardWallExceeded, responsiveExceeded, withinBudget: !hardWallExceeded && !responsiveExceeded,
        failure: hardWallExceeded ? 'hard wall ceiling' : responsiveExceeded ? 'responsive budget' : null};
    }, step(ready) {
      if(result)return result;
      if(ready && typeof ready.then==='function')throw new Error('Predicate must be synchronous');
      const timing=clock.sample();
      if(!timing.withinBudget||ready)result={done:true,passed:!!ready&&timing.withinBudget,timing};
      return result||{done:false,passed:false,timing};
    }, get result() {return result;}};
    return clock;
  }
  function dispose() {
    flush();
    if (taskObserver) { taskObserver.disconnect(); taskObserver = null; }
    cancel(heartbeatTimer); disposed = true;
  }
  return {sample, budget, dispose, finish(input) { const row=sample(input);dispose();return row; }};
})
