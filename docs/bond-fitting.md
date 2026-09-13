# Bond fitting and hydrogen constraints

## Why the cylinder ends protruded

For a cylinder of radius `r` whose axis is offset by `d` from an atom center,
the farthest point on its end rim is `d + r` from the bond axis. A cap at axial
distance `t` is entirely inside an atom of radius `R` only if

```
t² + (d + r)² ≤ R²
t ≤ sqrt(R² − (d + r)²)
```

The old calculation used `d² + r²`, omitting `2dr`, and compensated with
fixed overlaps. That seated offset cylinders too shallowly, especially in
Classic and Porcelain. One shared fit now computes both endpoint planes,
the cylinder length, and its center. Very short bonds reduce both trims
together, seating deeper; live coordinate edits recompute those trims.

## Maximum thickness

VibeMol spaces bond components by `s = 2.1r`. Doubles have axes at `±s/2`.
Triples form an equilateral triangle of circumradius `s`; quadruples use a
square of circumradius `s`. The whole bundle must fit at the equator of
both atoms, even when inserted all the way to their centers:

| Bond | Largest lateral offset | Maximum cylinder radius |
| --- | --- | --- |
| Single | `0` | `R` |
| Double | `1.05r` | `R / 2.05` ≈ `0.488R` |
| Triple | `2.1r` | `R / 3.1` ≈ `0.323R` |
| Quadruple | `2.1r` | `R / 3.1` ≈ `0.323R` |

Here `R` is the smaller endpoint's **safe mesh radius**, after element radii,
atom/metal scale, and the atom-size multiplier. Diameter is twice the listed
radius. The old absolute spacing floor has been removed: otherwise sufficiently
small atoms could never fit a triple bond, even at zero cylinder thickness.

A latitude/longitude sphere mesh lies inside the ideal sphere. For `w` width
segments and `h` height segments, a conservative inscribed radius is

```
R_safe = R_atom × cos(π/w) × cos(π/(2h)) × (1 − 0.0001)
```

The final factor reserves numerical clearance. Unit tests verify this bound
against every actual triangle face, including coarse meshes. This avoids
orientation-dependent gaps without intersecting every cylinder with every
sphere triangle at render time.

Collars, contour shells, and highlight shells enlarge the radial envelope.
They share the connector's scale and tighten the bound accordingly. Each
connector uses `min(requestedRadius, maximumRadius)`, and its spacing and
joints scale with it. Curved Kit joints seat against the same safe spheres;
turning off Curved bonds now uses straight collared components.

**Bond radius is a requested maximum, applied per bond.** A small hydrogen
does not shrink unrelated heavy-atom bonds. The Geometry inspector explains
the cap. Saved looks retain the requested size, so opening a different molecule
does not rewrite the preset. Atom-size, mesh-detail, topology, and multiplier
changes automatically produce a new fit. This derived rendering behavior needs
no new preset/session key and does not change coordinates or bond orders.

## Hydrogen topology

Hydrogen supports one neighbor and bond order one, across covalent and metal
connection styles. `structure.js` enforces this centrally:

- New H connections have order one. A second neighbor is rejected until the
  existing bond is removed. Blocked/deleted pairs consume no valence.
- Bond-order buttons disable higher orders for H. Click cycling, number keys,
  and direct bond edits report the restriction and preserve the structure.
- Growing an atom or fragment from an occupied H stops before inserting atoms.
  H placement and bond-length previews use single-bond lengths.
- Legacy structures/session hydration normalize H orders and keep one neighbor.
  Explicit bonds take precedence over perceived bonds; within that class the
  nearest connection wins, with a stable atom-ID tie-break. Atom coordinates
  and non-H topology are preserved.
- Covalent and metal perception share the same H capacity. The rounded H-radius
  table receives a 0.01 Å allowance in the summed-radius cutoff for H–H, so a
  0.74 Å H2 molecule is recognized as a single bond.

The existing special handling of explicitly deleting hydrogen remains intact:
it does not replace the H through automatic adjustment or optimize coordinates.

## Regression coverage

`bond-geometry.test.mjs` checks rim containment and thickness boundaries,
including mesh facets, unequal atoms, tiny radii, collars, and contours.
`hydrogen-bonds.test.mjs` and `bond-editing.test.mjs` exercise normalization,
mutation, inference, rejected edits without history, and deletion.
`looks.py` checks actual cap vertices across all curated presets and bond orders,
extreme radii/scales, straight/curved Kit selection, hydrogen canvas interaction,
and complete session restoration.

Validation for this change: `make check`, all 290 unit tests, all seven appearance
browser scenarios, and all 14 premerge browser scenarios passed. Classic and
Porcelain double/triple bonds were also rendered before and after the fix from
an oblique view and from the side. Browser checks used software WebGL.

The full smoke suite is not green: the current runtime fails the translate
selection-cue visibility check (`smoke.py`, selection move smoke). Serving the
unchanged `02d2a3f` runtime also fails the broader Edit UI smoke path, earlier at
the initial adaptive-menu check. These failures prevent claiming a complete
smoke pass; the new hydrogen canvas interactions and existing live bond-edit
regressions pass in the focused appearance suite.
