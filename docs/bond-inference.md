# Bond Inference

VibeMol uses a conservative bond model that separates three concerns:

- geometry-based initial connectivity inference
- explicit user-authored topology edits that must be preserved
- render-only normalization for special display cases such as aromatic six-rings

The implementation lives in `/Users/fevange/Source/vibemol/assets/app/js/bond-inference.js`.

## Overview

There are six distinct behaviors in the current system:

1. infer nonmetal-nonmetal covalent connectivity from geometry
2. infer metal-aware coordination-style bonds in separate metal passes
3. store inferred bonds with provenance `origin: 'perceived'`
4. preserve user-authored bonds and suppressed pairs explicitly
5. optionally promote imported nonmetal bond orders where supported
6. optionally normalize benzene-like six-rings for rendering without mutating stored topology

Outside edit mode, trajectory playback still uses a transient geometry-derived graph for rendering only. Stored topology is not mutated frame to frame.

## 1. Nonmetal Connectivity Inference

This is implemented by:

- `collectRawBondCandidates(...)`
- `acceptBondCandidatesByDistanceRank(...)`
- `perceiveBondConnectivity(...)`

### Supported nonmetal elements

Automatic nonmetal connectivity inference is intentionally limited to a main-group allowlist:

- `H`
- `B`
- `C`
- `N`
- `O`
- `F`
- `Si`
- `P`
- `S`
- `Cl`
- `Br`
- `I`

Metal-containing pairs are handled separately in the metal-aware passes below.

### Raw distance test

For each nonmetal pair `(i, j)`:

- look up covalent radii:
  - `r_i = covalent_radius(Z_i)`
  - `r_j = covalent_radius(Z_j)`
- define the nominal single-bond reference length:
  - `singleRef = r_i + r_j`
- define the acceptance cutoff:
  - `cutoff = 1.15 * singleRef`
- compute the actual distance:
  - `len = |R_i - R_j|`

The pair becomes a raw candidate only if:

```text
0.4 A <= len <= 1.15 * (r_i + r_j)
```

### Distance-ranked greedy acceptance

Raw candidates are sorted by increasing:

```text
len / (r_i + r_j)
```

Then accepted greedily if both endpoint atoms are still below their coordination cap.

Current nonmetal caps are:

- `H: 1`
- `B: 4`
- `C: 4`
- `N: 4`
- `O: 2`
- `F: 1`
- `Si: 4`
- `P: 5`
- `S: 6`
- `Cl: 1`
- `Br: 1`
- `I: 1`

Accepted nonmetal inferred edges start as:

- `order = 1`
- `kind = 'normal'`
- `origin = 'perceived'`
- `style = 'covalent'`

## 2. Metal-Aware Bond Inference

Pairs involving metals use a separate inference path.

### Metal-ligand pass

Metal-ligand edges use an empirical metal bonding-radius table rather than pure covalent radii.
The ligand side still uses its covalent radius.

For one metal-ligand pair:

```text
rSum = metal_bond_radius(metal) + covalent_radius(ligand)
```

Classification:

- `metal-strong` if `dist <= 1.10 * rSum`
- `metal-dative` if `dist <= 1.30 * rSum`
- otherwise no inferred bond

Candidates are then ranked and capped per metal by a metal-specific coordination-number limit.

Accepted metal-ligand edges are stored as:

- `order = 1`
- `kind = 'normal'`
- `origin = 'perceived'`
- `style = 'metal-strong'` or `style = 'metal-dative'`

### Metal-metal pass

Metal-metal edges are inferred in a dedicated tighter pass.
They are stored as:

- `order = 1`
- `kind = 'normal'`
- `origin = 'perceived'`
- `style = 'metal-metal'`

### Metal override modes

Per-metal inference can be overridden through:

- `vol.annotations.metalBonding.byAtomId[atomId].mode`

Supported modes:

- `auto`
- `force_covalent`
- `force_dative`
- `no_bonds`

These affect geometry-based metal inference only. Explicit user-authored bonds remain explicit unless blocked.

### Ligand-side valence rule

Metal-ligand bonds count toward the metal-side coordination budget, but do not count against the nonmetal ligand-side valence in:

- geometry inference
- auto-hydrogen planning
- edit halo open-site reasoning

This prevents ligands such as ammonia from losing their normal valence accounting when coordinated to a metal center.

## 3. Bond Provenance and Persistence

Stored bonds may carry:

- `origin: 'perceived'`
- `origin: 'explicit'`

Stored bonds also carry style:

- `style: 'covalent'`
- `style: 'metal-strong'`
- `style: 'metal-dative'`
- `style: 'metal-metal'`

Suppressed pairs are stored as:

- `kind: 'blocked'`
- `origin: 'explicit'`

Rules:

- geometry-based import inference creates `perceived` bonds
- `vibemol.structure` import preserves stored `origin`, `kind`, and `style`
- missing origin on older structure files defaults to `explicit`
- bond-tool create/update operations produce `explicit` bonds
- changing a perceived bond through the UI upgrades it to `explicit`
- `kind: 'blocked'` prevents later geometry-based re-perception of that pair

## 4. Imported Bond-Order Promotion

Imported molecules can promote nonmetal covalent single-bond connectivity to higher bond order where `inferBondOrders(...)` supports it.

Examples:

- carbonyl-like `C=O`
- other supported main-group multiple-bond motifs

Important scope rule:

- this promotion is for imported molecules
- builder-created and edit-session bonds are not globally reinterpreted this way
- metal-style bonds remain single-order connectivity with distinct `style`

## 5. Clean Up Bonds

The Bond tool includes a reviewed `Clean Up Bonds` workflow.

It recomputes the geometry-derived graph from the current coordinates and classifies the difference against the stored graph.

### Diff classes

- `additions`
  - newly perceived bonds that are missing from the current graph
- `removable`
  - stored bonds with `origin: 'perceived'` that are no longer supported by geometry
- `warnings`
  - stored bonds with `origin: 'explicit'` that the current geometry would not auto-perceive

Important rule:

- explicit bonds are never auto-removed by cleanup

Apply behavior:

- add missing inferred bonds as `origin: 'perceived'`
- remove only `origin: 'perceived'` bonds in the removable set
- leave explicit bonds untouched
- continue honoring `kind: 'blocked'` suppression

## 6. Render-Only Normalization

### Aromatic six-rings

`inferAromaticSixRings(...)` still detects benzene-like planar carbon six-rings and normalizes a copy of the render-edge list to alternating single/double order for display.

This affects:

- multi-bond rendering
- aromatic display overlays

This does not overwrite stored `vol.bonds`.

### Metal bond rendering

Metal styles are rendered distinctly from ordinary covalent bonds:

- `covalent`
  - normal split-color / multi-bond logic
- `metal-strong`
  - coordination-style connector
- `metal-dative`
  - dative-style connector
- `metal-metal`
  - dedicated metal-metal connector

These are persistent bond styles, not temporary display guesses.

## 7. Trajectory Rendering

When a record has multi-frame XYZ trajectory data and the app is not in edit mode:

- bond rendering uses a transient geometry-derived graph recomputed from the displayed frame

This is render-only behavior:

- stored `vol.bonds` remain unchanged
- `Save Structure` exports the stored graph
- plain XYZ export remains coordinates-only

## High-Level Pseudocode

```text
function perceive_connectivity(atoms):
    nonmetal_edges = perceive_nonmetal_covalent_pairs(atoms)
    metal_ligand_edges = perceive_metal_ligand_pairs(atoms)
    metal_metal_edges = perceive_metal_metal_pairs(atoms)

    return merge_without_duplicates(
        nonmetal_edges,
        metal_ligand_edges,
        metal_metal_edges
    )
```

Imported bond-order promotion:

```text
function infer_import_topology(atoms):
    edges = perceive_connectivity(atoms)
    covalent_edges = [edge for edge in edges if edge.style == 'covalent']
    promoted = infer_bond_orders(covalent_edges)
    keep metal-style edges at order 1
    return promoted + metal_style_edges
```

Cleanup classification:

```text
function classify_cleanup(current_graph, atom_positions):
    perceived = perceive_connectivity(atom_positions)

    additions = perceived - current_graph
    removable = {
        bond in current_graph
        where bond.origin == 'perceived'
        and bond not in perceived
    }
    warnings = {
        bond in current_graph
        where bond.origin == 'explicit'
        and bond not in perceived
    }

    return { perceived, additions, removable, warnings }
```
