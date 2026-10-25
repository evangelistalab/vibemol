"""Named test steps; bind evidence to the actual uncaught exception, not source text.

This observes failures without changing the original exception or test outcome.
The final exception hook identifies the same exception object that left the step;
a caught step failure followed by an unrelated assertion cannot inherit its name.
"""
from contextlib import contextmanager
import json
from pathlib import Path
import sys
import uuid

_original_hook = None
_binding = '_vibemol_workflow_failure'


def _exception_hook(kind, error, tb):
    try:
        _original_hook(kind, error, tb)
    finally:
        record = getattr(error, _binding, None) or {}
        # Emit an explicit unbound event too. A later unrelated exception must
        # supersede any earlier named failure rather than inherit its token.
        print('[workflow-exception] ' + json.dumps({
            'token': record.get('token'), 'suite': record.get('suite'),
            'exceptionType': kind.__name__}), file=sys.stderr, flush=True)


def _install_hook():
    global _original_hook
    if _original_hook is None:
        _original_hook = sys.excepthook
        sys.excepthook = _exception_hook


def native_keypress(page, key):
    page.keyboard.press(key)
    return {'kind': 'native-keydown', 'key': key, 'completed': True}


@contextmanager
def workflow_step(suite, workflow, step, facts):
    """Wrap precisely one assertion/action, never a whole feature or suite."""
    _install_hook()
    record = {'schema': 1, 'token': uuid.uuid4().hex,
              'suite': Path(suite).name, 'workflow': workflow, 'step': step}
    error = None
    try:
        yield
    except Exception as caught:
        error = caught
        record.update(outcome='failed', exceptionType=type(caught).__name__)
        # No wrapping, message edits, swallowed exception, wait or retry.
        try:
            setattr(caught, _binding, record)
        except Exception as binding_error:
            record['bindingError'] = str(binding_error)
        raise
    finally:
        if error is None:
            record.update(outcome='passed', exceptionType=None)
        try:
            record['facts'] = facts() if callable(facts) else facts
        except Exception as read_error:
            record['factsError'] = str(read_error)
        try:
            value = json.dumps(record)
        except (TypeError, ValueError) as serialization_error:
            record.pop('facts', None)
            record['factsError'] = str(serialization_error)
            value = json.dumps(record)
        print('[workflow-step] ' + value, flush=True)
