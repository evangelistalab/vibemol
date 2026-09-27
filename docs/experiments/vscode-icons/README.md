# Flat extension icon study

Ten alternatives based on VibeMol's website favicon, molecular shapes, and the
shared blue (`#3b5bd9`) and yellow (`#ffc53a`) palette. Every proposal uses only
these two flat colors plus transparency. There are no gradients or shadows.

Open `index.html` to compare the designs at several sizes on light or dark
backgrounds. Selecting a card reveals downloads for its editable SVG and 256×256
PNG. Option **10 — Website tile** was selected and copied into the extension's
`resources/icon.svg` and `resources/icon.png`. The remaining designs are proposals.

| Number | Name | Direction |
| --- | --- | --- |
| 01 | Website + nucleus | Existing three-spoke mark with a yellow center |
| 02 | Split mark | Existing mark with one yellow spoke |
| 03 | Flat molecule | Simple atom nodes and bonds |
| 04 | Tetrahedron | Geometric connectivity |
| 05 | Phase pair | Opposite orbital lobes |
| 06 | Orbital fork | Three lobes echoing the website mark |
| 07 | V + nucleus | A V anchored by one atom |
| 08 | Bond ring | Hexagonal ring with one highlighted bond |
| 09 | VM monogram | Two initials in two colors |
| 10 | Website tile | Website silhouette inside a flat blue tile |

Regenerate PNG exports and comparison sheets using the existing Python
Playwright setup:

```bash
python docs/experiments/vscode-icons/render.py
```
