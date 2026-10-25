(function () {
  // Observation only: none of these values changes a deadline or its outcome.
  const now = performance.now.bind(performance);
  const startedAtMs = now(), longTasks = [];
  let taskObserver = null, droppedLongTasks = 0, observerError = null;
  const collect = entries => {
    for (const e of entries) {
      if (e.startTime + e.duration < startedAtMs) continue;
      if (longTasks.length < 4096) longTasks.push({startTime: e.startTime,
        duration: e.duration, name: e.name, entryType: e.entryType});
      else droppedLongTasks++;
    }
  };
  try {
    if (typeof PerformanceObserver === 'undefined'
        || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      throw new Error('PerformanceObserver longtask entries are unavailable');
    }
    taskObserver = new PerformanceObserver(list => collect(list.getEntries()));
    taskObserver.observe({type: 'longtask', buffered: true});
  } catch (error) { observerError = String(error); }
  function dispose() {
    if (taskObserver) {
      try { collect(taskObserver.takeRecords()); taskObserver.disconnect(); }
      catch (error) { observerError = String(error); }
      taskObserver = null;
    }
  }
  return {dispose, finish(input) {
    dispose();
    const readbackAtMs = now();
    const wait = Number.isFinite(input.startedAtMs) ? {startedAtMs: input.startedAtMs,
      timeoutMs: input.timeoutMs, deadlineAtMs: input.startedAtMs + input.timeoutMs} : null;
    const observedWaitEndAtMs = input.completedAtMs ?? readbackAtMs;
    const end = wait ? Math.min(observedWaitEndAtMs, wait.deadlineAtMs) : null;
    const overlapping = wait ? longTasks.filter(e => e.startTime < end
      && e.startTime + e.duration > wait.startedAtMs) : [];
    const intervals = wait ? overlapping.map(e => [Math.max(e.startTime,wait.startedAtMs),
      Math.min(e.startTime + e.duration,end)]).sort((a,b) => a[0]-b[0]) : [];
    let overlap = 0, previousEnd = -Infinity;
    for (const [start,stop] of intervals) {
      overlap += Math.max(0,stop-Math.max(start,previousEnd));
      previousEnd = Math.max(previousEnd,stop);
    }
    return {preludeStartedAtMs: startedAtMs, wait,
      deadlineSample: input.deadlineSample || null, readback: {observedAtMs: readbackAtMs},
      readbackAfterDeadlineMs: wait ? readbackAtMs-wait.deadlineAtMs : null,
      observedWaitEndAtMs, longTasks: longTasks.slice(),
      longTasksCrossingDeadline: wait ? longTasks.filter(e => e.startTime < wait.deadlineAtMs
        && e.startTime + e.duration >= wait.deadlineAtMs) : [],
      longTasksOverlappingWait: overlapping, longTaskOverlapMs: wait ? overlap : null,
      hadLongTaskOverlap: wait && overlap > 0 ? true : wait && !observerError && !droppedLongTasks
        && wait.startedAtMs >= startedAtMs ? false : null,
      droppedLongTasks, observerError, waitStartedBeforeObserver: wait ? wait.startedAtMs < startedAtMs : null,
      samplingCaveat: 'Completed long-task entries only. A blocked renderer delays observations; use actual timestamps and lateness, never a late snapshot as exact deadline state. Renderer descheduling may produce no longtask entry. No stall time is discounted.'};
  }};
})
