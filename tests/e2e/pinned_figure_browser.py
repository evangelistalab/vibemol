"""Resolve the ordinary headless browser from its installed Playwright manifest.

Never search PATH, choose another cached revision, or fall back to full Chrome.
BrowserType.executable_path supplies the configured cache root, including custom
PLAYWRIGHT_BROWSERS_PATH installations where only the headless shell is present.
"""
import json
import os
import platform
import re
import subprocess
import sys
from pathlib import Path


def resolve_pinned_headless_browser(full_executable, launched_version, metadata_path):
    metadata_path = Path(metadata_path)
    try:
        manifest = json.loads(metadata_path.read_text())
        entries = manifest['browsers']
        full = [row for row in entries if row['name'] == 'chromium']
        shell = [row for row in entries if row['name'] == 'chromium-headless-shell']
        if len(full) != 1 or len(shell) != 1:
            raise ValueError('expected exactly one chromium and chromium-headless-shell entry')
        full, shell = full[0], shell[0]
        if full.get('revisionOverrides') or shell.get('revisionOverrides'):
            raise ValueError('platform revisionOverrides require an explicit resolver update')
        for row in (full, shell):
            if not re.fullmatch(r'[0-9]+', str(row['revision'])):
                raise ValueError('revision must be numeric')
            if row['browserVersion'] != launched_version:
                raise ValueError(f"{row['name']} version {row['browserVersion']} != launched {launched_version}")
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError(f'Pinned Figure browser metadata unavailable/invalid: {metadata_path}: {error}; no browser fallback') from error

    full_path = Path(full_executable)
    if len(full_path.parents) < 3 or full_path.parents[1].name != 'chromium-'+str(full['revision']):
        raise RuntimeError(f'Pinned Figure cache root cannot be derived from {full_path}; expected chromium-{full["revision"]} from {metadata_path}; no browser fallback')
    distribution = {('linux', 'x86_64'): 'linux64', ('linux', 'aarch64'): 'linux-arm64',
                    ('darwin', 'arm64'): 'mac-arm64', ('darwin', 'x86_64'): 'mac-x64'}.get((sys.platform, platform.machine()))
    if distribution is None:
        raise RuntimeError(f'Pinned Figure headless distribution unsupported: {sys.platform}/{platform.machine()}; metadata {metadata_path}; no browser fallback')
    executable = full_path.parents[2]/('chromium_headless_shell-'+str(shell['revision']))/('chrome-headless-shell-'+distribution)/'chrome-headless-shell'
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise RuntimeError(f'Pinned Figure headless executable missing/not executable: {executable}; metadata {metadata_path}; no browser fallback')
    try:
        version = subprocess.run([str(executable), '--version'], check=True, capture_output=True, text=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError(f'Pinned Figure executable version probe failed: {executable}; metadata {metadata_path}: {error}; no browser fallback') from error
    match = re.search(r'\b\d+\.\d+\.\d+\.\d+\b', version)
    if not match or match[0] != launched_version:
        raise RuntimeError(f'Pinned Figure executable version mismatch: {executable}: {version!r}, expected {launched_version} from {metadata_path}; no browser fallback')
    print('[figure-runner] pinned executable '+json.dumps(dict(metadata=str(metadata_path), executable=str(executable), revision=shell['revision'], version=launched_version)), flush=True)
    return str(executable)
