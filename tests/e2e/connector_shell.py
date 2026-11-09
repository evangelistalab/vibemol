"""Check idle connector traffic and the toolbar control in both layouts."""
import json

from checkpoint_contract import require_phase_counts
from helpers import run_http_server, wait_for_presented_state


SUITE = 'tests/e2e/workbench_bar.py'
ANALYTICS_URL = 'https://www.googletagmanager.com/gtag/js?id=G-WSP0EFW68E'
ENABLE_LABEL = 'Enable AI connector'
WAITING_LABEL = 'AI connector waiting for a client. Release tab'


def observe_launch(browser, app_url, relay_url, launch):
    control = launch == 'positive-control'
    control_page = app_url + '?connectorObserverControl=1'
    http_probe = relay_url + 'connector-observer-control'
    socket_probe = 'ws://' + relay_url.removeprefix('http://') + 'connector-observer-control'
    http_attempts, socket_attempts, page_errors = [], [], []
    with browser.new_context(viewport={'width': 1512, 'height': 950}) as context:
        page = context.new_page()
        page.on('pageerror', lambda error: page_errors.append(str(error)))
        session = context.new_cdp_session(page)

        def intercept(event):
            request_url = event['request']['url']
            request = {'requestId': event['requestId']}
            if control and request_url == control_page:
                session.send('Fetch.fulfillRequest', {
                    **request, 'responseCode': 200,
                    'responseHeaders': [{'name': 'Content-Type', 'value': 'text/html; charset=utf-8'}],
                })
            elif request_url.startswith(app_url):
                session.send('Fetch.continueRequest', request)
            else:
                http_attempts.append(request_url)
                session.send('Fetch.failRequest', {**request, 'errorReason': 'BlockedByClient'})

        # Fetch interception does not observe WebSocket upgrades.
        session.on('Fetch.requestPaused', intercept)
        session.on('Network.webSocketCreated', lambda event: socket_attempts.append(event['url']))
        session.send('Fetch.enable', {'patterns': [{'urlPattern': 'http://*'}, {'urlPattern': 'https://*'}]})
        session.send('Network.enable')
        if control:
            expected = {'receipt': {'httpBlocked': True, 'socketClosed': 3},
                        'httpAttempts': [http_probe], 'webSocketAttempts': [socket_probe]}
            page.goto(control_page)
            page.evaluate('''([http, ws]) => {
              const receipt = window.connectorObserverReceipt = {httpBlocked: null, socketClosed: null};
              fetch(http).then(() => { receipt.httpBlocked = false; }, () => { receipt.httpBlocked = true; });
              const socket = new WebSocket(ws);
              socket.addEventListener('close', () => { receipt.socketClosed = socket.readyState; }, {once: true});
            }''', [http_probe, socket_probe])
            try:
                page.wait_for_function('''() => {
                  const receipt = window.connectorObserverReceipt;
                  return receipt.httpBlocked !== null && receipt.socketClosed !== null;
                }''')
            finally:
                receipt = page.evaluate('() => window.connectorObserverReceipt')
                actual = {'receipt': receipt, 'httpAttempts': http_attempts, 'webSocketAttempts': socket_attempts}
                print('[connector-observer-control] ' + json.dumps({
                    'actual': actual, 'expected': expected,
                }), flush=True)
        else:
            page.goto(app_url + ('?workspaceLab=0' if launch == 'legacy' else ''))
            wait_for_presented_state(page, '() => !!window.VibeMolTesting')
            button = page.get_by_role('button', name=ENABLE_LABEL, exact=True)
            named_controls = button.count()
            actual = {
                'namedControls': named_controls,
                'disabled': named_controls == 1 and button.is_disabled(),
                'state': button.get_attribute('data-connector-state') if named_controls == 1 else None,
                'workbench': page.evaluate('() => !!window.VibeMolWorkbench'),
                'relayHttpAttempts': [request for request in http_attempts if request.startswith(relay_url)],
                'unexpectedHttpAttempts': [request for request in http_attempts if request != ANALYTICS_URL],
                'webSocketAttempts': socket_attempts,
            }
            expected = {'namedControls': 1, 'disabled': False, 'state': 'off', 'workbench': launch == 'workbench',
                        'relayHttpAttempts': [], 'unexpectedHttpAttempts': [], 'webSocketAttempts': []}
        record = {'launch': launch, 'relayOrigin': relay_url, 'blockedHttp': http_attempts,
                  'actual': {**actual, 'pageErrors': page_errors}, 'expected': {**expected, 'pageErrors': []}}
        print('[connector-shell-network] ' + json.dumps(record), flush=True)
        assert record['actual'] == record['expected'], record
        return record


def audit_connector_launches(browser, app_url, root):
    with run_http_server(root) as relay_url:
        records = [observe_launch(browser, app_url, relay_url, launch)
                   for launch in ('positive-control', 'workbench', 'legacy')]
    actual = len(browser.contexts)
    print('[connector-shell-contexts] ' + json.dumps({'actual': actual, 'expected': 0}), flush=True)
    assert actual == 0, actual
    require_phase_counts({'connector-shell-network': len(records)}, SUITE, 'connector-shell-network')


def audit_connector_hitbox(page, width, mode, *, require_overflow=False):
    wait_for_presented_state(page, '''() =>
      document.body.dataset.wbCompact === String(VibeMolWorkbench.snapshot().compact)''')
    overflowed = page.locator('#connectorPilotButton.wb-overflowed').count() == 1
    trigger = page.locator('#workbenchOverflowBtn')
    menu = page.locator('#workbenchOverflowMenu')
    if overflowed:
        trigger.focus()
        page.keyboard.press('ArrowDown')
    metrics = page.evaluate('''overflowed => {
      const button = document.getElementById('connectorPilotButton');
      if (!button) return null;
      const rows = [...document.getElementById('workbenchOverflowMenu').children]
        .filter(row => row.getAttribute('aria-label') === button.getAttribute('aria-label'));
      const target = overflowed ? rows[0] : button;
      const rect = target?.getBoundingClientRect();
      const hit = rect && document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        rect: rect?.toJSON(), hit: hit?.id || hit?.tagName || null,
        compact: document.body.dataset.wbCompact === 'true',
        actual: {
          previousId: button.previousElementSibling?.id,
          inWorkbenchActions: !!button.closest('#workbenchBar .wb-bar-actions'),
          overflowed: button.classList.contains('wb-overflowed'),
          meets32pxFloor: !!rect && Math.min(rect.width, rect.height) >= 32,
          inViewport: !!rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          centerHit: !!target?.contains(hit),
          ...(overflowed ? {
            inlineHidden: getComputedStyle(button).display === 'none',
            menuItems: rows.length,
            menuItemUnavailable: target?.getAttribute('aria-disabled') === 'true',
            keyboardReached: target === document.activeElement,
          } : {}),
        },
      };
    }''', overflowed)
    actual = metrics and metrics['actual']
    expected = {'previousId': 'githubRepoLink', 'inWorkbenchActions': True,
                'overflowed': require_overflow or overflowed,
                'meets32pxFloor': True, 'inViewport': True, 'centerHit': True}
    if overflowed:
        expected.update(inlineHidden=True, menuItems=1, menuItemUnavailable=False,
                        keyboardReached=True, focusReturned=True)
        if require_overflow and mode == 'Edit':
            expected['activation'] = {
                'enabled': 'waiting', 'label': WAITING_LABEL, 'mirroredTitle': True, 'released': 'off',
            }
            if actual and actual['keyboardReached'] and not actual['menuItemUnavailable']:
                button = page.locator('#connectorPilotButton')
                page.keyboard.press('Enter')
                wait_for_presented_state(page, '''() =>
                  document.getElementById('connectorPilotButton').dataset.connectorState !== 'preparing' ''')
                enabled = button.get_attribute('data-connector-state')
                page.keyboard.press('ArrowDown')
                focused = menu.locator('button:focus')
                label = focused.get_attribute('aria-label') if focused.count() == 1 else None
                mirrored_title = label == WAITING_LABEL and focused.get_attribute('title') == button.get_attribute('title')
                if label == WAITING_LABEL:
                    page.keyboard.press('Enter')
                actual['activation'] = {
                    'enabled': enabled, 'label': label, 'mirroredTitle': mirrored_title,
                    'released': button.get_attribute('data-connector-state'),
                }
        if actual is not None:
            if menu.is_visible():
                page.keyboard.press('Escape')
            actual['focusReturned'] = menu.is_hidden() and trigger.evaluate('el => el === document.activeElement')
    if width <= 390:
        expected['compact'] = True
        if actual is not None:
            actual['compact'] = metrics['compact']
    record = {'width': width, 'mode': mode, 'metrics': metrics, 'actual': actual, 'expected': expected}
    print('[connector-shell-hitbox] ' + json.dumps(record), flush=True)
    assert actual == expected, record
    return record
