import json, subprocess, tempfile, numpy as np
from pathlib import Path
from pyscf import gto, scf, lib
from pyscf.tools import molden as pmolden
OUT = Path(__file__).resolve().parents[2] / "tests/fixtures/molden-g"
VM = "/home/claude/repos/vibemol"; TOOLS = "/home/claude/work/tools"
rng = np.random.default_rng(20261123)
pts_bohr = rng.uniform(-2.5, 2.5, size=(64, 3))          # random points near the nucleus

def pyscf_eval_from_molden(path, mos):
    mol, mo_e, mo_c, mo_occ, irrep, spin = pmolden.load(str(path))
    ao = mol.eval_gto("GTOval_cart" if mol.cart else "GTOval_sph", pts_bohr)
    return (ao @ mo_c[:, mos]).T, mol

def vibemol_eval_grid(path, mos, origin, step, n):
    with tempfile.TemporaryDirectory() as td:
        g = Path(td)/"g.json"; o = Path(td)/"o.bin"
        g.write_text(json.dumps({"origin": origin, "step": step, "nxyz": n, "mos": mos}))
        r = subprocess.run(["node", f"{TOOLS}/vibemol_molden_eval.mjs", VM, str(path), str(g), str(o)], capture_output=True, text=True, cwd=TOOLS)
        if r.returncode: return None, r.stderr.strip().splitlines()[-1]
        return np.fromfile(o, dtype=np.float64).reshape(len(mos), -1), None

def grid_points(origin, step, n):
    ax = [origin[i] + step*np.arange(n[i]) for i in range(3)]
    X, Y, Z = np.meshgrid(*ax, indexing="ij"); return np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)

def g_weight(mol, C):
    labels = mol.ao_labels(fmt=False)
    mask = np.array([("g" in l[2]) for l in labels])
    return (C[mask]**2).sum(0) / (C**2).sum(0)

report = {}
# --- 1. Validate PySCF's Cartesian Molden writer against VibeMol's existing Cartesian d/f code.
mol = gto.M(atom="Ne 0 0 0; Ne 0.3 0.2 2.1", basis="cc-pvtz", cart=True, unit="angstrom", verbose=0)
mf = scf.RHF(mol).run()
pmolden.from_scf(mf, str(OUT/"ne2_cart_tz.molden"))
origin, step, n = [-1.0, -1.1, -0.9], 0.37, [7, 7, 11]
gp = grid_points(origin, step, n)
mos = list(range(0, 30))
v_vm, err = vibemol_eval_grid(OUT/"ne2_cart_tz.molden", mos, origin, step, n)
m2, _, c2, *_ = pmolden.load(str(OUT/"ne2_cart_tz.molden"))
v_py = (m2.eval_gto("GTOval_cart", gp) @ c2[:, mos]).T
# MO phases can differ between readers only if the file were ambiguous; compare directly.
report["cart_df_check_maxabs"] = float(np.abs(v_vm - v_py).max()) if v_vm is not None else err

# --- 2. Cartesian g reference (PySCF writer, same code path validated in step 1 for d/f).
molc = gto.M(atom="Ne 0 0 0", basis="cc-pvqz", cart=True, verbose=0); mfc = scf.RHF(molc).run()
pmolden.from_scf(mfc, str(OUT/"ne_cart_qz.molden"))
mc_, _, cc_, *_ = pmolden.load(str(OUT/"ne_cart_qz.molden"))
wc = g_weight(mc_, cc_); gmos_c = [int(i) for i in np.argsort(-wc)[:15]]
vals_c = (mc_.eval_gto("GTOval_cart", pts_bohr) @ cc_[:, gmos_c]).T

# --- 3. Spherical g reference from forte2's writer, evaluated by PySCF from the file.
from forte2 import RHF, System
from forte2.orbitals import write_molden
from forte2.lib import ints
s = System(xyz="Ne 0 0 0", basis_set="cc-pvqz", auxiliary_basis_set="def2-universal-jkfit")
rhf = RHF(charge=0, e_tol=1e-10)(s); rhf.run()
write_molden(rhf, OUT/"ne_sph_qz_forte2.molden")
ms_, _, cs_, *_ = pmolden.load(str(OUT/"ne_sph_qz_forte2.molden"))
ws = g_weight(ms_, cs_); gmos_s = [int(i) for i in np.argsort(-ws)[:9]]
vals_s = (ms_.eval_gto("GTOval_sph", pts_bohr) @ cs_[:, gmos_s]).T
# independent check against forte2's own AO evaluator (no Molden involved), on a small grid
o2, st2, n2 = [-1.3, -1.2, -1.1], 0.45, [6, 6, 6]
v_f2 = np.asarray(ints.orbitals_on_grid(s.basis, np.ascontiguousarray(rhf.C[0]), o2, n2, (np.eye(3)*st2).tolist())).T
v_ps = (ms_.eval_gto("GTOval_sph", grid_points(o2, st2, n2)) @ cs_).T
sgn = np.sign((v_f2*v_ps).sum(1)); sgn[sgn == 0] = 1
report["sph_pyscf_vs_forte2_maxabs_all_mos"] = float(np.abs(v_f2 - sgn[:, None]*v_ps).max())
report["g_weight_spherical"] = [round(float(ws[i]), 6) for i in gmos_s]
report["g_weight_cartesian"] = [round(float(wc[i]), 6) for i in gmos_c]
# current VibeMol behaviour on the g files (expected: throws)
_, e1 = vibemol_eval_grid(OUT/"ne_sph_qz_forte2.molden", gmos_s[:1], o2, st2, [2, 2, 2])
report["vibemol_today_spherical_g"] = e1
fixture = {
  "description": "Reference MO values for Molden g shells. Points in bohr relative to the file's [Atoms] (Ne at origin). "
                 "MO indices are 0-based positions in the [MO] section. Values are the MO amplitude at each point.",
  "points_bohr": pts_bohr.round(12).tolist(),
  "spherical": {"file": "ne_sph_qz_forte2.molden", "writer": "forte2 write_molden", "mos": gmos_s, "values": vals_s.tolist()},
  "cartesian": {"file": "ne_cart_qz.molden", "writer": f"pyscf {__import__('pyscf').__version__} tools.molden", "mos": gmos_c, "values": vals_c.tolist()},
}
json.dump(fixture, open(OUT/"molden_g_reference.json", "w"))
print("RESULT", json.dumps(report))
