"""Exact latent-overlap allowances; never accepted ordinary suite failures."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
BASELINE=ROOT/'tests/baselines/surface-overlap-baseline.json'
AUTHORITY=ROOT/'tests/baselines/surface-overlap-authority.json'
# Independent, intentional tripwire, like the retired-setting registry guard.
# Updating a JSON claim of authorization cannot authorize its own expansion.
AUTHORIZED_SIGNATURE_SHA256='ecb87a83ed0c93de255368178374cac9e4226ac09fb0c9b95762d1a489c114e4'


def signatures(document):
    result=set();ids=set();pairs=set()
    assert document['acceptedCiFailures']==[]
    assert document['growthRequiresHumanAuthorization'] is True
    for entry in document['entries']:
        assert entry['id'] not in ids;ids.add(entry['id'])
        pair=tuple(entry['pair']);assert len(pair)==2 and pair==tuple(sorted(set(pair)))
        assert pair not in pairs;pairs.add(pair)
        assert entry['classification'] in ['intentional','unreachable','suspected defect']
        assert entry['acceptedCiFailure'] is False and entry['inspectionReason']
        if entry['classification']=='suspected defect':assert type(entry['trackingIssue']) is int and entry['issueUrl'].endswith('/'+str(entry['trackingIssue']))
        assert entry['directions']
        for direction in entry['directions']:
            assert sorted([direction['covering'],direction['covered']])==list(pair)
            assert direction['targets'] and len(set(direction['targets']))==len(direction['targets'])
            for target in direction['targets']:
                assert isinstance(target,str) and target and '*' not in target and ':nth-' not in target
                key=(entry['id'],direction['covering'],direction['covered'],target)
                assert key not in result;result.add(key)
    return result


def validate_baseline(document, authority=None, predecessor=None):
    authority=authority or json.loads(AUTHORITY.read_text())
    approved={tuple(row) for row in authority['approvedSignatures']}
    encoded=json.dumps(sorted(map(list,approved)),separators=(',',':'),ensure_ascii=False).encode()
    assert hashlib.sha256(encoded).hexdigest()==authority['signatureSha256']==AUTHORIZED_SIGNATURE_SHA256
    actual=signatures(document)
    assert actual<=approved,dict(new=sorted(actual-approved),expected='only explicitly authorized signatures')
    if predecessor is not None:
        previous=signatures(predecessor)
        assert actual<=previous,dict(new=sorted(actual-previous),expected='baseline may shrink; growth needs new human authorization and an explicit contract update')
    return actual


def evaluate(cases, document=None):
    document=document or json.loads(BASELINE.read_text())
    allowed=validate_baseline(document)
    by_pair={tuple(entry['pair']):entry['id'] for entry in document['entries']}
    observed=set();unexpected=[]
    for case in cases:
        for row in case['collisions']:
            pair=tuple(sorted([row['hitSurface'],row['surface']]))
            key=(by_pair.get(pair),row['hitSurface'],row['surface'],row.get('targetSelector'))
            observed.add(key)
            if key not in allowed or row.get('selectorMatches')!=1:
                unexpected.append(dict(context=case['context'],signature=list(key),readback=row))
    return dict(passed=not unexpected,unexpected=unexpected,
                observedSignatures=[list(k) for k in sorted(observed,key=str)],
                knownSignatures=[list(k) for k in sorted(observed&allowed)],
                absentAllowedSignatures=[list(k) for k in sorted(allowed-observed)],
                acceptedCiFailures=[],baselineGrowthAllowed=False)
