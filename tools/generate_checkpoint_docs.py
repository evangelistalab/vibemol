"""Generate the browser checkpoint table from the manifest."""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tests/baselines/browser-suite.json'
DOC = ROOT / 'docs/maintenance/checkpoint-counts.md'
BEGIN = '<!-- BEGIN GENERATED CHECKPOINT COUNTS -->'
END = '<!-- END GENERATED CHECKPOINT COUNTS -->'


def update_table(text, counts):
    prefix, old = text.split(BEGIN)
    _, suffix = old.split(END)
    lines = ['| Entry point | Marker | Required records |', '| --- | --- | ---: |']
    lines.extend(f'| `{entry}` | `{marker}` | {count} |'
                 for entry, markers in counts.items() for marker, count in markers.items())
    return prefix + BEGIN + '\n' + '\n'.join(lines) + '\n' + END + suffix


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    current = DOC.read_text()
    updated = update_table(current, json.loads(MANIFEST.read_text())['checkpointCounts'])
    if args.check:
        if current != updated:
            parser.exit(1, 'Checkpoint table is stale. Run python3 tools/generate_checkpoint_docs.py\n')
    else:
        DOC.write_text(updated)


if __name__ == '__main__':
    main()
