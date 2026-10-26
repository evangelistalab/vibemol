"""Read-only lifetime assertions and scoped child-resource observations."""
import json
import time


def assert_browser_lifetime(browser, *, stage, contexts, pages, connected, records):
    live=list(browser.contexts)
    actual=dict(contexts=len(live),pages=sum(len(c.pages)for c in live),connected=browser.is_connected())
    expected=dict(contexts=contexts,pages=pages,connected=connected)
    row=dict(stage=stage,observedAtMonotonicMs=time.monotonic()*1000,actual=actual,expected=expected,
             passed=actual==expected)
    records.append(row)
    print('[browser-lifetime] '+json.dumps(row),flush=True)
    assert actual==expected,row
    return row


def child_usage():
    try:
        import resource
        value=resource.getrusage(resource.RUSAGE_CHILDREN)
        return dict(available=True,userSeconds=value.ru_utime,systemSeconds=value.ru_stime,
                    maxRssNative=value.ru_maxrss,
                    scope='OS RUSAGE_CHILDREN: terminated/reaped child accounting, not live aggregate RSS or physical-host contention. maxRssNative has platform-native units; it is not a sum or a delta.')
    except (ImportError,OSError)as error:
        return dict(available=False,error=str(error))


def child_usage_delta(before, after):
    result=dict(before=before,after=after)
    if before['available']and after['available']:
        result.update(userSeconds=after['userSeconds']-before['userSeconds'],
                      systemSeconds=after['systemSeconds']-before['systemSeconds'])
    return result
