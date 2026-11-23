const channel = 'vibemol.embed';
const version = 1;
const widgets = new Map();

function fail(model, id, error) {
  model.send({ kind: 'response', id, result: { ok: false, error } });
}

function initialize({ model }) {
  const token = model.get('token');
  const widget = { view: null, queue: [], synchronized: false };
  function onCommand(request) {
    if (request.kind === 'frontend-sync') {
      widget.synchronized = true;
      return;
    }
    if (!widget.synchronized || request.kind !== 'request') return;
    const view = widget.view;
    if (view?.phase === 'incompatible') fail(model, request.id, view.error);
    else if (view?.phase === 'ready') view.post(request);
    else widget.queue.push(request);
  }
  widgets.set(token, widget);
  model.on('msg:custom', onCommand);
  model.send({ kind: 'frontend-attached' });
  return () => {
    model.off('msg:custom', onCommand);
    widget.view?.close();
    widgets.delete(token);
  };
}

function render({ model, el }) {
  const token = model.get('token');
  const widget = widgets.get(token);
  if (widget.view) {
    const notice = document.createElement('p');
    notice.textContent = 'This VibeMol viewer is already displayed above';
    el.append(notice);
    return () => notice.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.title = 'VibeMol molecular viewer';
  iframe.style.width = '100%';
  iframe.style.border = '1px solid #ccd1dd';
  iframe.style.borderRadius = '8px';
  const adjustHeight = () => { iframe.style.height = `${model.get('height')}px`; };
  adjustHeight();

  const url = new URL(model.get('url'));
  url.searchParams.set('embed', 'commands');
  url.hash = `vmtoken=${token}`;
  const sent = new Set();
  let origin;

  function post(request) {
    sent.add(request.id);
    iframe.contentWindow.postMessage({ ...request, channel, v: version, token }, origin);
  }

  function ready(info, eventOrigin) {
    const compatible = info.commandVersion === version;
    view.phase = compatible ? 'ready' : 'incompatible';
    view.error = compatible ? null : {
      code: 'incompatible',
      message: 'The viewer does not support command registry version 1',
      details: { commandVersion: info.commandVersion ?? null },
    };
    model.set('ready', compatible);
    model.set('app_info', info);
    model.set('last_error', view.error);
    model.save_changes();
    model.send({ kind: 'ready', info });

    const queue = widget.queue;
    widget.queue = [];
    origin = eventOrigin === 'null' ? '*' : eventOrigin;
    if (compatible) for (const request of queue) post(request);
  }

  function onMessage(event) {
    const { data } = event;
    if (event.source !== iframe.contentWindow || data?.channel !== channel
      || data.v !== version || data.token !== token) return;
    if (data.kind === 'ready' && view.phase === 'waiting') {
      ready(data.info || {}, event.origin);
    } else if (view.phase === 'ready') {
      if (data.kind === 'response' && sent.delete(data.id)) {
        model.send({ kind: 'response', id: data.id, result: data.result });
      } else if (data.kind === 'state') {
        model.set('selection', data.state.selection);
        model.set('calculations', data.state.calculations);
        model.save_changes();
      }
    }
  }

  function close() {
    if (widget.view !== view) return;
    widget.view = null;
    window.removeEventListener('message', onMessage);
    model.off('change:height', adjustHeight);
    iframe.remove();
    for (const id of sent) fail(model, id, {
      code: 'view-closed', message: 'The live VibeMol view closed before replying',
    });
    sent.clear();
    model.set('ready', false);
    model.set('app_info', {});
    model.set('selection', null);
    model.set('calculations', null);
    model.set('last_error', null);
    model.save_changes();
  }

  const view = { phase: 'waiting', post, close, error: null };
  widget.view = view;
  window.addEventListener('message', onMessage);
  model.on('change:height', adjustHeight);
  iframe.src = url.href;
  el.append(iframe);
  return close;
}

export default { initialize, render };
