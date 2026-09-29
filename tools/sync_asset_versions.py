#!/usr/bin/env python3
"""Stamp committed web asset URLs from the runtime's single APP_VERSION constant."""
from __future__ import annotations

import argparse
import html
from html.parser import HTMLParser
import pathlib
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / 'assets/app/js/asset-urls.js'
VERSION_RE = re.compile(r"const APP_VERSION = '([^']+)';")
CSS_URL_RE = re.compile(r'url\(\s*([\'"]?)([^\s)]+?)\1\s*\)', re.I)
ATTRIBUTE_RE = re.compile(r'\b(src|href|poster)\s*=\s*([\'"])(.*?)\2', re.I | re.S)


def app_version() -> str:
    match = VERSION_RE.search(VERSION_FILE.read_text())
    if not match:
        raise ValueError(f'Missing APP_VERSION in {VERSION_FILE}')
    return match[1]


def asset_url(value: str, source: pathlib.Path, version: str) -> str:
    parts = urlsplit(value)
    if parts.scheme or parts.netloc or not parts.path:
        return value
    target = (ROOT / parts.path.lstrip('/') if parts.path.startswith('/')
              else source.parent / parts.path).resolve()
    if ROOT not in target.parents or not target.is_file():
        raise ValueError(f'{source.relative_to(ROOT)}: missing local asset {value}')
    query = [(key, val) for key, val in parse_qsl(parts.query, keep_blank_values=True) if key != 'v']
    query.append(('v', version))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def stamp_css(text: str, source: pathlib.Path, version: str) -> str:
    return CSS_URL_RE.sub(lambda m: f'url({m[1]}{asset_url(m[2], source, version)}{m[1]})', text)


def stamp_html(text: str, source: pathlib.Path, version: str) -> str:
    # Parse actual tags, not strings inside inline scripts. Apply replacements
    # back to the original text to retain markup, whitespace, and script order.
    replacements = []
    offsets = [0]
    for line in text.splitlines(keepends=True):
        offsets.append(offsets[-1] + len(line))

    class Parser(HTMLParser):
        in_style = False

        def source_offset(self):
            line, column = self.getpos()
            return offsets[line - 1] + column

        def handle_starttag(self, tag, attrs):
            self.in_style = tag == 'style'
            if tag not in ('script', 'link', 'img', 'source', 'video', 'audio', 'input'):
                return
            values = dict(attrs)
            if tag == 'link' and not set(values.get('rel', '').split()) & {'stylesheet', 'icon', 'preload', 'modulepreload'}:
                return
            start = self.source_offset()
            for match in ATTRIBUTE_RE.finditer(self.get_starttag_text()):
                value = asset_url(html.unescape(match[3]), source, version)
                replacements.append((start + match.start(3), start + match.end(3), html.escape(value, quote=True)))
            if values.get('srcset'):
                raise ValueError('Add srcset URL stamping before using responsive image sources')

        def handle_endtag(self, tag):
            if tag == 'style':
                self.in_style = False

        def handle_data(self, data):
            if self.in_style:
                start = self.source_offset()
                replacements.append((start, start + len(data), stamp_css(data, source, version)))

    Parser(convert_charrefs=False).feed(text)
    for start, end, value in sorted(replacements, reverse=True):
        text = text[:start] + value + text[end:]
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if committed asset URLs need regeneration')
    parser.add_argument('--version', help='Set the release version and regenerate URLs in one step')
    args = parser.parse_args()
    if args.version:
        if args.check or not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', args.version):
            parser.error('--version requires a semantic version and cannot be combined with --check')
        VERSION_FILE.write_text(VERSION_RE.sub(f"const APP_VERSION = '{args.version}';", VERSION_FILE.read_text()))
    version = app_version()
    sources = [ROOT / 'index.html', *sorted((ROOT / 'src/styles').rglob('*.css')),
               *sorted((ROOT / 'assets/app/css').rglob('*.css'))]
    stale = []
    for source in sources:
        old = source.read_text()
        stamp = stamp_html if source.suffix == '.html' else stamp_css
        new = stamp(old, source, version)
        if new != old:
            stale.append(str(source.relative_to(ROOT)))
            if not args.check:
                source.write_text(new)
    if args.check and stale:
        print('Asset versions are stale. Run make version-assets:\n' + '\n'.join(stale), file=sys.stderr)
        return 1
    print(f'Asset URLs {"checked" if args.check else "updated"} for v{version}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
