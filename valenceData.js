(function (global) {
  // Editable default valence table per element symbol.
  // This is a pragmatic default used for quick hydrogen adjustment and auto bond order hints.
  // Feel free to refine values based on your workflow/chemistry.
  const VALENCE_TABLE = {
    X: 0,
    H: 1, He: 0,
    Li: 1, Be: 2, B: 3, C: 4, N: 3, O: 2, F: 1, Ne: 0,
    Na: 1, Mg: 2, Al: 3, Si: 4, P: 3, S: 2, Cl: 1, Ar: 0,
    K: 1, Ca: 2,
    Sc: 3, Ti: 4, V: 5, Cr: 3, Mn: 2, Fe: 2, Co: 2, Ni: 2, Cu: 1, Zn: 2,
    Ga: 3, Ge: 4, As: 3, Se: 2, Br: 1, Kr: 0,
    Rb: 1, Sr: 2, Y: 3, Zr: 4, Nb: 5, Mo: 6, Tc: 7, Ru: 2, Rh: 3, Pd: 2, Ag: 1, Cd: 2,
    In: 3, Sn: 4, Sb: 3, Te: 2, I: 1, Xe: 0,
    Cs: 1, Ba: 2, La: 3, Ce: 3, Pr: 3, Nd: 3, Pm: 3, Sm: 3, Eu: 3, Gd: 3, Tb: 3,
    Dy: 3, Ho: 3, Er: 3, Tm: 3, Yb: 3, Lu: 3,
    Hf: 4, Ta: 5, W: 6, Re: 7, Os: 6, Ir: 3, Pt: 2, Au: 1, Hg: 2,
    Tl: 3, Pb: 4, Bi: 3, Po: 2, At: 1, Rn: 0,
    Fr: 1, Ra: 2, Ac: 3, Th: 4, Pa: 5, U: 6, Np: 5, Pu: 4, Am: 3, Cm: 3, Bk: 3, Cf: 3, Es: 3, Fm: 3
  };

  // Also export as a map by atomic number for convenience.
  const VALENCE_Z = {};
  if (global.ATOM_DATA && global.ATOM_SYMBOL_TO_Z) {
    for (const d of global.ATOM_DATA) {
      const z = global.ATOM_SYMBOL_TO_Z[d.symbol.toUpperCase()];
      if (z !== undefined) VALENCE_Z[z] = (VALENCE_TABLE[d.symbol] ?? 1);
    }
  }

  global.VALENCE_TABLE = VALENCE_TABLE;
  global.VALENCE_Z = VALENCE_Z;
})(typeof window !== 'undefined' ? window : globalThis);

