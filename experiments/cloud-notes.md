# Cloud Rendering Experiments

Goal: render electron density as a colored cloud (positive vs negative) instead of iso-surfaces.

Sample stats (from `sample.cube`)
- grid: 79 × 74 × 57 → 333,222 voxels
- value range (min/max): −9.9999e−05 … +9.9999e−05
- abs percentiles: p95 ≈ 6.83e−05, p99 ≈ 9.33e−05, max ≈ 1.00e−04
- recommendation: treat |ρ| < 1e−06 as noise; map useful range to [0, 1] via |ρ| / 1.0e−4 (clamped), or use p99 (9.33e−05) as the upper bound for better contrast.

Two approaches

1) Instanced “voxel splats” (cubes)
- Build two `THREE.InstancedMesh` (pos/neg) with `BoxGeometry(cellSize * k)` where `cellSize` derives from axis vectors and `k≈0.85` to leave a gap.
- For each voxel above threshold `t`:
  - Position = voxel center in world coordinates
  - Per-instance color = pos/neg color
  - Per-instance opacity = transfer(|ρ|) (e.g., linear from `t`→0 to `hi`→αmax)
- Material: `MeshStandardMaterial` or `MeshPhysicalMaterial` with `transparent:true`, `depthWrite:false`, `blending:THREE.NormalBlending` (or `AdditiveBlending` to brighten overlaps)
- Performance: filter by threshold and/or subsample (e.g., stride of 2–3), and cap instance count (e.g., ~50–200k).

2) Point sprites (splat particles)
- Build two `THREE.Points` with `BufferGeometry` (pos/neg) containing positions of selected voxels.
- Attributes: `color` (RGB), `alpha` (as float or in color’s .a via custom shader)
- Material: `THREE.ShaderMaterial` or `THREE.PointsMaterial` with `sizeAttenuation:true`, `transparent:true`, `depthWrite:false`, `blending:THREE.AdditiveBlending`
- Shader (recommended): draws a soft round disk (or approximate sphere) in the fragment stage to reduce blockiness and create a cloud.
- Performance: similar filtering as above; merging into a single draw per sign.

Transfer function
- Use symmetric mapping for sign; magnitude mapping examples:
  - Linear: `a = clamp((|ρ| - tLow)/(tHigh - tLow), 0, 1)`
  - Gamma: `a = pow(a, γ)` with γ≈0.6 for more midtones
  - Suggested defaults (from sample): `tLow = 1e−06`, `tHigh = 9.33e−05` (p99), `αmax = 0.6`.

Notes
- For correct cell size: use axis vectors `[ax, ay, az]` (Bohr) → Å; voxel center `(i+0.5, j+0.5, k+0.5)` in lattice coords → world with existing `voxelToWorld()` but offset by 0.5 along each axis vector.
- Sorting is expensive; prefer `depthWrite:false` and blending; consider rendering neg then pos (or vice versa) for predictable overlap.
- Start with stride=2 in each dimension (~41k voxels) and raise as GPU allows.

Next steps (implementation sketch in index.html)
- Add a “Cloud mode” toggle and a select: `Cubes` / `Points`.
- Wire a `buildCloudCubes(vol, opts)` and `buildCloudPoints(vol, opts)` that return `THREE.Group` to add under `contentGroup`.
- Expose UI for `stride`, `threshold`, `alpha max`, and `tHigh preset: max/p99`.

