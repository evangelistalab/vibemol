"""Exercise the shipped refusal and signed consent with a fixture authority."""
import base64
from contextlib import contextmanager
import json
import re
from uuid import uuid4

from checkpoint_contract import require_phase_counts


SUITE = 'tests/e2e/workbench_bar.py'
AUTHORITY = 'https://connector-authority.test'
REQUEST_TYPE = 'vibemol.connector.consent.request'
READY_TYPE = 'vibemol.connector.consent.ready'
APPROVED_TYPE = 'vibemol.connector.consent.approved'
CHANNEL = 'vibemol.connector.consent.v2'
ENABLE = '#connectorPilotButton'
STATUS = '[data-connector-consent]'
DIALOG = '[data-connector-approval]'
CLIENT = 'Fixture AI <b>client</b>'
EXPECTED_CASES = [
    'unconfigured', 'no-enabled-tab', 'unverified-request', 'availability-only',
    'synthetic-approval', 'trusted-approval', 'replay', 'escape-declines', 'release-during-sign',
]

AUTHORITY_FIXTURE = r'''async ({origin, clientName}) => {
  const encode = new TextEncoder();
  const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const bytes = text => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const keyAlgorithm = { name: 'ECDSA', namedCurve: 'P-256' };
  const signatureAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
  const pair = await crypto.subtle.generateKey(keyAlgorithm, false, ['sign', 'verify']);
  const config = {issuer: location.origin, audience: location.origin + '/mcp',
    publicKeySpki: base64(await crypto.subtle.exportKey('spki', pair.publicKey))};
  const messages = [];
  addEventListener('message', event => {
    if (event.origin === origin && event.source === window.consentPopup) messages.push(event.data);
  });
  window.consentFixture = {
    messages,
    async request() {
      const now = Date.now();
      const claims = {purpose: 'connect', issuer: config.issuer, audience: config.audience,
        challenge: crypto.randomUUID(), grantId: crypto.randomUUID(), clientId: 'fixture-client',
        clientName, scopes: ['read', 'select'], issuedAt: now - 1000, expiresAt: now + 110000};
      const payload = base64(encode.encode(JSON.stringify(claims)));
      const signature = await crypto.subtle.sign(signatureAlgorithm, pair.privateKey,
        encode.encode('vibemol.connector.request.v1\0' + payload));
      return {claims, request: {payload, signature: base64(signature)}};
    },
    async verifyApproval({request, approval}) {
      const {publicKeySpki, pageInstanceNonce, signature} = approval;
      const key = await crypto.subtle.importKey('spki', bytes(publicKeySpki), keyAlgorithm, false, ['verify']);
      const message = encode.encode('vibemol.connector.approval.v1\0' +
        JSON.stringify([request.payload, publicKeySpki, pageInstanceNonce]));
      return crypto.subtle.verify(signatureAlgorithm, key, bytes(signature), message);
    },
  };
  return config;
}'''

APP_PROBE = r'''() => {
  const probe = window.consentProbe = {
    posted: [], checks: [], clicks: [], signStarted: 0, signFinished: 0, hold: false, resume: null,
  };
  const decode = new TextDecoder();
  const post = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function (message) {
    if (this.name === 'vibemol.connector.consent.v2') probe.posted.push(structuredClone(message));
    return post.call(this, message);
  };
  const verify = SubtleCrypto.prototype.verify;
  SubtleCrypto.prototype.verify = async function (algorithm, key, signature, data) {
    const valid = await verify.call(this, algorithm, key, signature, data);
    if (decode.decode(data).startsWith('vibemol.connector.request.v1\0')) probe.checks.push(valid);
    return valid;
  };
  const sign = SubtleCrypto.prototype.sign;
  SubtleCrypto.prototype.sign = async function (algorithm, key, data) {
    if (!decode.decode(data).startsWith('vibemol.connector.approval.v1\0')) return sign.call(this, algorithm, key, data);
    probe.signStarted++;
    if (probe.hold) await new Promise(resolve => { probe.resume = resolve; });
    const signature = await sign.call(this, algorithm, key, data);
    probe.signFinished++;
    return signature;
  };
  addEventListener('click', event => {
    if (event.target.closest?.('[data-connector-approval] button') && event.target.textContent === 'Approve') {
      probe.clicks.push(event.isTrusted);
    }
  }, true);
}'''


@contextmanager
def fixture(browser, url, root, *, configured):
    with browser.new_context(viewport={'width': 1512, 'height': 950}) as context:
        empty = '<!doctype html><meta charset="utf-8"><title>Consent fixture</title>'
        context.route(AUTHORITY + '/', lambda route: route.fulfill(content_type='text/html', body=empty))
        context.route(url + 'connector-fixture-observer', lambda route: route.fulfill(content_type='text/html', body=empty))
        context.route('https://www.googletagmanager.com/**', lambda route: route.abort())
        opener = context.new_page()
        opener.goto(AUTHORITY + '/')
        config = opener.evaluate(AUTHORITY_FIXTURE, {'origin': url.rstrip('/'), 'clientName': CLIENT})
        if configured:
            source = (root / 'assets/app/js/connector-adapter.js').read_text()
            anchor = 'const consentAuthority = null;'
            actual = source.count(anchor)
            assert actual == 1, {'actual': actual, 'expected': 1, 'literal': anchor}
            source = source.replace(anchor, f'const consentAuthority = {json.dumps(config)};')
            script = re.compile(re.escape(url + 'assets/app/js/connector-adapter.js') + r'(?:\?.*)?$')
            context.route(script, lambda route: route.fulfill(content_type='text/javascript', body=source))
        else:
            # A same-origin global with the right key must not configure the shipped script.
            context.add_init_script('window.consentAuthority = ' + json.dumps(config) + ';')
        observer = context.new_page()
        observer.goto(url + 'connector-fixture-observer')
        observer.evaluate('name => { window.consentChannel = new BroadcastChannel(name); }', CHANNEL)
        app = context.new_page()
        app.add_init_script('(' + APP_PROBE + ')()')
        errors = []
        app.on('pageerror', lambda error: errors.append(str(error)))
        app.goto(url)
        with opener.expect_popup() as popup:
            opener.evaluate('url => { window.consentPopup = window.open(url); }', url + 'connector-consent.html')
        consent = popup.value
        consent.on('pageerror', lambda error: errors.append(str(error)))
        consent.wait_for_load_state()
        try:
            yield opener, observer, app, consent, errors
        except Exception:
            print('[connector-consent-failure] ' + json.dumps({
                'page': state(consent), 'adapter': snapshot(app), 'openerMessages': messages(opener), 'errors': errors,
            }), flush=True)
            raise


def record(cases, name, actual, expected):
    receipt = {'case': name, 'actual': actual, 'expected': expected}
    print('[connector-consent-case] ' + json.dumps(receipt), flush=True)
    assert actual == expected, receipt
    cases.append(name)


def state(page):
    return page.locator(STATUS).get_attribute('data-consent-state')


def messages(opener):
    return opener.evaluate('() => consentFixture.messages')


def snapshot(app):
    return app.evaluate('''() => ({
      ...consentProbe, resume: !!consentProbe.resume,
      state: document.getElementById('connectorPilotButton').dataset.connectorState,
      dialog: !!document.querySelector('[data-connector-approval][open]'),
    })''')


def enable(app):
    app.locator(ENABLE).click()
    app.locator(ENABLE + '[data-connector-state="waiting"]').wait_for()


def post_request(opener, url, request):
    opener.evaluate('''([type, origin, request]) => consentPopup.postMessage({type, request}, origin)''',
                    [REQUEST_TYPE, url.rstrip('/'), request])


def broadcast(observer, data):
    observer.evaluate('data => consentChannel.postMessage(data)', data)


def discover(observer, app):
    request_id = str(uuid4())
    broadcast(observer, {'type': 'discover', 'requestId': request_id})
    app.wait_for_function('id => consentProbe.posted.some(message => message.requestId === id)', arg=request_id)
    return request_id


def audit_unconfigured(browser, url, root, cases):
    with fixture(browser, url, root, configured=False) as (opener, observer, app, consent, errors):
        packet = opener.evaluate('() => consentFixture.request()')
        enable(app)
        post_request(opener, url, packet['request'])
        broadcast(observer, {'type': 'prepare', 'request': packet['request']})
        request_id = discover(observer, app)
        probe = snapshot(app)
        record(cases, 'unconfigured', {
            'state': state(consent), 'notice': consent.get_by_role('status').inner_text(),
            'checkVisible': consent.locator('[data-consent-check]').is_visible(),
            'openerMessages': messages(opener), 'posted': probe['posted'],
            'verifications': probe['checks'], 'dialog': probe['dialog'], 'approvalSigns': probe['signStarted'],
            'errors': errors,
        }, {
            'state': 'unavailable', 'notice': 'AI connector consent is unavailable.', 'checkVisible': False,
            'openerMessages': [], 'posted': [{'type': 'available', 'requestId': request_id}],
            'verifications': [], 'dialog': False, 'approvalSigns': 0, 'errors': [],
        })


def audit_configured(browser, url, root, cases):
    with fixture(browser, url, root, configured=True) as (opener, observer, app, consent, errors):
        opener.wait_for_function('type => consentFixture.messages.some(message => message.type === type)', arg=READY_TYPE)
        packet = opener.evaluate('() => consentFixture.request()')
        request = packet['request']
        forged_claims = {**packet['claims'], 'clientName': 'Forged client'}
        forged = {**request, 'payload': base64.urlsafe_b64encode(json.dumps(forged_claims).encode()).decode().rstrip('=')}
        post_request(opener, url, forged)
        consent.locator(STATUS + '[data-consent-state="request-refused"]').wait_for()
        page_refusal = {'state': state(consent), 'checkVisible': consent.locator('[data-consent-check]').is_visible()}
        post_request(opener, url, request)
        consent.locator(STATUS + '[data-consent-state="find-tab"]').wait_for()
        record(cases, 'no-enabled-tab', {
            'state': state(consent), 'notice': consent.get_by_role('status').inner_text(),
            'checkVisible': consent.locator('[data-consent-check]').is_visible(),
            'openerMessages': messages(opener), 'adapter': snapshot(app)['state'],
        }, {
            'state': 'find-tab', 'notice': 'Open VibeMol, enable the AI connector in the tab you want, then check again.',
            'checkVisible': True, 'openerMessages': [{'type': READY_TYPE}], 'adapter': 'off',
        })

        enable(app)
        broadcast(observer, {'type': 'prepare', 'request': forged})
        app.wait_for_function('() => consentProbe.checks.length === 1')
        probe = snapshot(app)
        record(cases, 'unverified-request', {
            'pageRefusal': page_refusal,
            'verifications': probe['checks'], 'dialog': probe['dialog'], 'posted': probe['posted'],
        }, {'pageRefusal': {'state': 'request-refused', 'checkVisible': False},
            'verifications': [False], 'dialog': False, 'posted': []})

        request_id = discover(observer, app)
        record(cases, 'availability-only', snapshot(app)['posted'], [{'type': 'available', 'requestId': request_id}])
        consent.get_by_role('button', name='Check for an enabled tab').click()
        dialog = app.locator(DIALOG)
        approve = dialog.get_by_role('button', name='Approve', exact=True)
        dialog.wait_for()
        dialog_content = {
            'heading': dialog.get_by_role('heading').inner_text(),
            'permissions': dialog.get_by_role('listitem').all_inner_texts(),
            'screenshotNotice': dialog.get_by_text('Screenshot sharing is off', exact=False).inner_text(),
            'interpretedMarkup': dialog.locator('b').count(),
        }
        approve.evaluate('button => button.click()')
        probe = snapshot(app)
        record(cases, 'synthetic-approval', {
            **dialog_content, 'clicks': probe['clicks'], 'dialog': probe['dialog'],
            'signs': probe['signStarted'], 'offers': [entry for entry in probe['posted'] if entry['type'] != 'available'],
            'messages': messages(opener),
        }, {
            'heading': 'Connect ' + CLIENT + '?',
            'permissions': ['Read the active molecule and selection.', 'Replace the highlighted atom selection.'],
            'screenshotNotice': 'Screenshot sharing is off and requires separate approval.',
            'interpretedMarkup': 0, 'clicks': [False], 'dialog': True, 'signs': 0, 'offers': [],
            'messages': [{'type': READY_TYPE}],
        })

        approve.click()
        opener.wait_for_function('type => consentFixture.messages.some(message => message.type === type)', arg=APPROVED_TYPE)
        probe = snapshot(app)
        approved = messages(opener)[1:]
        record(cases, 'trusted-approval', {
            'state': state(consent), 'clicks': probe['clicks'], 'signs': probe['signStarted'],
            'offers': [entry['type'] for entry in probe['posted'] if entry['type'] != 'available'],
            'messages': [entry['type'] for entry in approved], 'request': approved[0]['request'],
            'challenge': approved[0]['approval']['challenge'],
            'signatureValid': opener.evaluate('receipt => consentFixture.verifyApproval(receipt)', approved[0]),
        }, {
            'state': 'approval-sent', 'clicks': [False, True], 'signs': 1, 'offers': ['approval'],
            'messages': [APPROVED_TYPE], 'request': request, 'challenge': packet['claims']['challenge'],
            'signatureValid': True,
        })

        app.locator(ENABLE).click()
        enable(app)
        broadcast(observer, {'type': 'prepare', 'request': request})
        post_request(opener, url, request)
        app.wait_for_function('() => consentProbe.checks.length === 3')
        probe = snapshot(app)
        record(cases, 'replay', {
            'state': state(consent), 'verifications': probe['checks'], 'dialog': probe['dialog'],
            'signs': probe['signStarted'], 'approvedReplies': len(messages(opener)) - 1,
        }, {'state': 'approval-sent', 'verifications': [False, True, True], 'dialog': False, 'signs': 1,
            'approvedReplies': 1})

        declined = opener.evaluate('() => consentFixture.request()')['request']
        broadcast(observer, {'type': 'prepare', 'request': declined})
        dialog.wait_for()
        app.evaluate('''() => {
          consentProbe.escapeReachedApp = false;
          addEventListener('keydown', event => {
            if (event.key === 'Escape') consentProbe.escapeReachedApp = true;
          }, true);
        }''')
        app.keyboard.press('Escape')
        dialog.wait_for(state='detached')
        probe = snapshot(app)
        record(cases, 'escape-declines', {
            'escapeReachedApp': probe['escapeReachedApp'], 'dialog': probe['dialog'],
            'state': probe['state'], 'signs': probe['signStarted'],
        }, {'escapeReachedApp': False, 'dialog': False, 'state': 'waiting', 'signs': 1})

        fresh = opener.evaluate('() => consentFixture.request()')['request']
        broadcast(observer, {'type': 'prepare', 'request': fresh})
        dialog.wait_for()
        app.evaluate('() => { consentProbe.hold = true; }')
        approve.focus()
        app.keyboard.press('Enter')
        app.wait_for_function('() => consentProbe.signStarted === 2 && !!consentProbe.resume')
        app.evaluate('''() => {
          dispatchEvent(new PageTransitionEvent('pagehide'));
          consentProbe.resume();
        }''')
        app.wait_for_function('() => consentProbe.signFinished === 2')
        probe = snapshot(app)
        record(cases, 'release-during-sign', {
            'state': probe['state'], 'dialog': probe['dialog'], 'clicks': probe['clicks'],
            'completedSigns': probe['signFinished'],
            'offers': [entry['type'] for entry in probe['posted'] if entry['type'] != 'available'], 'errors': errors,
        }, {'state': 'off', 'dialog': False, 'clicks': [False, True, True], 'completedSigns': 2,
            'offers': ['approval'], 'errors': []})


def audit_connector_consent(browser, url, root):
    cases = []
    audit_unconfigured(browser, url, root, cases)
    audit_configured(browser, url, root, cases)
    actual = {'cases': cases, 'remainingContexts': len(browser.contexts)}
    expected = {'cases': EXPECTED_CASES, 'remainingContexts': 0}
    print('[connector-consent-coverage] ' + json.dumps({'actual': actual, 'expected': expected}), flush=True)
    assert actual == expected, (actual, expected)
    require_phase_counts({'connector-consent-case': len(cases)}, SUITE, 'connector-consent-case')
