# VibeMol Python API Prototype

Minimal automation client for rendering VibeMol images from local molecular files.

## What it does
- Opens hosted VibeMol: `https://evangelistalab.org/vibemol/`
- Uploads one local file (`.cube`, `.cub`, `.2ccube`, or `.xyz`)
- Saves the rendered canvas to a local PNG
- Can import/export full visualization presets shared with the web UI

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
python -m playwright install chromium
```

## Usage
```bash
python api/vibemol_client.py assets/data/sample.cube out/sample.png
```

Optional controls:
```bash
python api/vibemol_client.py assets/data/sample.cube out/sample_toon.png \
  --style toon \
  --iso 0.02 \
  --wait-ms 1500
```

Import preset then override a couple of fields:
```bash
python api/vibemol_client.py assets/data/sample.cube out/sample_from_preset.png \
  --preset my-favorite.json \
  --preset-mode relaxed \
  --style glossy
```

Save effective settings to a preset file:
```bash
python api/vibemol_client.py assets/data/sample.cube out/sample.png \
  --save-preset out/current-preset.json \
  --preset-name "CLI export"
```

## `.vibemolrc` automation
The client auto-discovers a config file at:
- `./.vibemolrc` or `./.vibemolrc.json`
- `~/.vibemolrc` or `~/.vibemolrc.json`

If `--preset` is not passed, it loads a preset from rc automatically.

Minimal rc examples:

Direct preset payload:
```json
{
  "kind": "vibemol.preset",
  "presetVersion": 1,
  "settings": {
    "molecule.style": "toon",
    "surface.iso": 0.02
  }
}
```

Reference a preset file:
```json
{
  "preset": "my-favorite-preset.json",
  "preset_mode": "relaxed"
}
```

CLI control:
- `--rc /path/to/config.json` use explicit rc file
- `--no-rc` disable rc auto-discovery
- `--preset` always overrides rc preset

Style mapping:
- `default` = Default
- `toon` = Toon
- `fancy` = alias for `toon` (for compatibility)
- `studio` = Kit
- `glossy` = Glossy

## Notes
- This is a prototype for single-file rendering.
- It captures the main canvas output as PNG.
- The CLI prefers `window.VibeMolPreset` when available; otherwise it falls back to best-effort DOM application/export.
