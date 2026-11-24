# Plotting vectors from XYZ

Open a vector XYZ the same way you open an ordinary XYZ. The arrows follow
their atoms as you rotate the view. They also appear in VibeMol image and
Figure exports, and vector data is kept when you save a VibeMol session.

## File format

Use a single XYZ block. The first line is the atom count. The second line
starts with `VibeMolVectors=`, followed by a JSON array on the same line.
Give each set a unique `name`, a `color` in `#RRGGBB` format and a positive
`scale`. After the usual element and position in angstroms, each atom row
has three vector components per set, in the order listed on line two.

```text
3
VibeMolVectors=[{"name":"Gradient difference","color":"#159778","scale":0.8},{"name":"Interstate coupling","color":"#d65d08","scale":0.4}]
O  0.000 0.000 0.000   0.4 0.2 0.0    0.0 0.8 0.0
H  0.757 0.586 0.000   0.0 0.0 0.0    1.0 0.1 0.0
H -0.757 0.586 0.000  -0.6 0.5 0.0    0.0 0.0 0.0
```

The tip is at the atom position plus the vector times its set's scale.
The scale converts your input components to a plotted displacement in
angstroms. Use the same scale for sets whose arrow lengths you intend to
compare. Zero vectors draw no arrow. Vector input is for a single
structure. Save a VibeMol session to keep the original vectors when
sharing the scene. Plain XYZ export writes geometry only.

## Rotating and moving a structure

When an Edit rotation or Align principal axes rotates atoms, the same
rotation is applied to the vector components attached to those atoms.
Translating atoms leaves the components unchanged. Non-rigid edits such
as UFF optimization, symmetrization, and per-atom coordinate typing also
leave the components unchanged.

A whole-structure rotation also rotates free arrow vectors. A free arrow
with a fixed point origin follows the structure's full rotation or
translation. An arrow anchored to the center of mass follows the computed
center automatically. Edit Undo and Redo restore the stored vector state
alongside the coordinates.

## Vector commands and sessions

Use `vectors.setAtoms` for components in the current atom order and
`vectors.setArrow` for a free arrow. Each name is unique within the
structure. A free arrow can start at a point in angstroms or follow
the center of mass. With `heads: 'both'`, the named length spans the
two tips, with the anchor at their midpoint. A zero vector draws
no arrow.

A vector command that changes a loaded structure adds one **Vectors** step
to Edit history. Undo and Redo restore per-atom vector sets and free arrows
in order alongside rotation and translation steps. Repeating an unchanged
command leaves history and Redo intact. In Measure mode, the shortcut
operates on measurements. Switch to View or Edit to use Edit history.

A 0.10.16 session opened in 0.10.15 or earlier keeps per-atom vectors and drops
free arrows.

## Matching the reference look

Open [the example XYZ](../examples/xyz-vectors.xyz), select
**Properties → Look → Classic**, and use an orthographic camera. Classic
provides a white background and shaded ball-and-stick geometry. For the
muted palette in the preview, set these in **Look → Colors → Edit**:

| Element | Preview color |
| --- | --- |
| Carbon | `#8d8f91` |
| Nitrogen | `#8296c8` |
| Oxygen | `#c78280` |
| Sulfur | `#e1cb79` |

The example uses illustrative vectors. The reference screenshot alone
cannot supply the original 3D coordinates, vectors, or scale factors.
Use the Figure composer or a page layout tool for panel headings, reported
norms and the shared color legend.
