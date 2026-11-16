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
