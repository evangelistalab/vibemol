# VibeMol Python API Prototype

Minimal automation client for rendering VibeMol images from local molecular files.

## What it does
- Opens hosted VibeMol: `https://evangelistalab.org/vibemol/`
- Uploads one local molecular file (`.cube`, `.cub`, `.2ccube`, `.xyz`, `.hess`, `.dat`, `.out`, `.output`)
- Optionally uploads sidecar files in the same request (`.vib.json`, `.vmodes.json`, `.modes.json`, `.json`)
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

Notebook embed helper (`vibemol(...)`):
```python
from api.vibemol_client import vibemol

# Hosted VibeMol
vibemol("assets/data/sample.cube", source="web", height=760)

# Local static server mode (python3 -m http.server 8000)
vibemol("assets/data/sample.cube", source="local", local_port=8000, height=760)
```

Note:
- `vibemol(...)` displays inline by default and returns `None`.
- Use `auto_display=False` if you want to capture and manually display the returned `HTML` object.

Batch render multiple files:
```bash
python api/vibemol_client.py \
  --inputs assets/data/a.cube assets/data/b.cube assets/data/c.xyz \
  --output-dir out/batch
```

Batch render with wildcards (quoted patterns are supported):
```bash
python api/vibemol_client.py \
  --inputs "assets/data/*.cube" "assets/data/*.xyz" \
  --output-dir out/batch
```

Custom output naming in batch mode:
```bash
python api/vibemol_client.py \
  --inputs assets/data/a.cube assets/data/b.cube \
  --output-dir out/batch \
  --name-template "{index:03d}_{stem}.png"
```

Optional controls:
```bash
python api/vibemol_client.py assets/data/sample.cube out/sample_toon.png \
  --style toon \
  --iso 0.02 \
  --wait-ms 1500
```

Upload a molecule and a vibration sidecar together:
```bash
python api/vibemol_client.py assets/data/water.xyz out/water.png \
  --extra-file assets/data/water.vib.json
```

Notebook helper with multiple files:
```python
vibemol(
  ["assets/data/water.xyz", "assets/data/water.vib.json"],
  source="local",
  local_port=8000,
  options={"clearFirst": True}
)
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
- `--continue-on-error` keeps batch rendering after one file fails

Style mapping:
- `default` = Default
- `toon` = Toon
- `fancy` = alias for `toon` (for compatibility)
- `kit` = Kit
- `studio` = alias for `kit` (legacy compatibility)
- `glossy` = Glossy

## Notes
- Single-file mode is `input_file output_png`.
- Batch mode is `--inputs ... --output-dir ...`.
- Wildcard patterns are supported in `--inputs` (for example `"*.cube"`).
- Wildcard patterns are also supported in `--extra-file`.
- `--save-preset` is only supported in single-file mode.
- It captures the main canvas output as PNG.
- The CLI prefers `window.VibeMolPreset` when available; otherwise it falls back to best-effort DOM application/export.
