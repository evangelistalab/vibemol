import json, numpy as np
from forte2 import AVAS, CISolver, MCOptimizer, RHF, State, System
from forte2.orbitals import write_molden
xyz = """
H   0.912650   0.000000   1.457504
H  -0.912650   0.000000   1.457504
H   0.000000  -1.585659  -1.038624
H   0.000000   1.585659  -1.038624
C   0.000000   0.000000   0.859492
C   0.000000  -0.651229  -0.499559
C   0.000000   0.651229  -0.499559
"""
s = System(xyz=xyz, basis_set="cc-pvdz", auxiliary_basis_set="def2-universal-jkfit")
rhf = RHF(charge=0, e_tol=1e-10, d_tol=1e-8)(s)
avas = AVAS(subspace=["C(2p)"], subspace_pi_planes=[["C1-3"]], selection_method="total", num_active=3)(rhf)
ci = CISolver(State(nel=rhf.nel, multiplicity=1, ms=0.0), nroots=2, weights=[0.5, 0.5])
mc = MCOptimizer(ci, e_tol=1e-10, g_tol=1e-7, final_orbitals="original", do_transition_dipole=True)(avas)
mc.run()
g0 = np.asarray(mc.gradient(root=0)); g1 = np.asarray(mc.gradient(root=1))
cs = mc.ci_solver if hasattr(mc, "ci_solver") else ci
td = {str(k): np.asarray(v).tolist() for k, v in getattr(cs, "transition_dipoles", {}).items()}
osc = {str(k): float(v) for k, v in getattr(cs, "oscillator_strengths", {}).items()}
nuc = np.asarray(s.nuclear_dipole(unit="au")).tolist()
write_molden(mc, "cyclopropene_sa2cas43.molden")
out = dict(E_states=[float(e) for e in np.atleast_1d(getattr(mc, "E_ci", getattr(cs, "E", mc.E)))], E=float(mc.E),
           grad_S0=g0.tolist(), grad_S1=g1.tolist(), transition_dipoles_au=td, oscillator=osc, nuclear_dipole_au=nuc,
           atoms=[[a[0], list(map(float, a[1]))] for a in s.atoms])
json.dump(out, open("cyclopropene_sa2cas43_raw.json", "w"), indent=1)
print("RESULT", json.dumps({k: out[k] for k in ("E_states", "E", "oscillator", "nuclear_dipole_au")}))
print("RESULT td", td)
print("RESULT |g0|", np.linalg.norm(g0, axis=1).round(5).tolist(), "|g1|", np.linalg.norm(g1, axis=1).round(5).tolist())
