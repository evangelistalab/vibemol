"""Run only unreachable-code rules over owned, tracked source and live harnesses."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def source_files():
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    # Include new files before their first commit too. Never scan historical
    # evidence, copied extension app assets, vendors or generated artifacts.
    tracked += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    return sorted({p for p in tracked if p.startswith(('assets/app/', 'src/', 'api/', 'tests/e2e/', 'tests/unit/', 'tools/'))
                   and not p.startswith(('src/vscode_ext/vibemol/app/', 'tools/diagnostics/fixtures/'))})


def main():
    files = source_files()
    js = [p for p in files if Path(p).suffix in ('.js', '.mjs', '.cjs')]
    py = [p for p in files if p.endswith('.py')]
    print(f'[unreachable] JavaScript files: {len(js)}; Python files: {len(py)}', flush=True)
    subprocess.run([os.environ.get('ESLINT', str(ROOT/'node_modules/.bin/eslint')), '--no-inline-config', *js], cwd=ROOT, check=True)
    subprocess.run([os.environ.get('PYLINT_PYTHON', sys.executable), '-m', 'pylint', '--disable=all', '--enable=unreachable',
                    '--reports=no', '--score=no', '--persistent=no', *py], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
