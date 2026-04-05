(function (global) {
  'use strict';

  /**
   * UFF — Universal Force Field in JavaScript
   *
   * Adapted for VibeMol as a standalone global module.
   * This file is intentionally not wired into runtime edit flows yet.
   *
   * Original implementation notes:
   *   Rappé, Casewit, Colwell, Goddard, Skiff
   *   "UFF, a Full Periodic Table Force Field for Molecular Mechanics
   *    and Molecular Dynamics Simulations"
   *   J. Am. Chem. Soc. 1992, 114, 10024–10035
   */

  // ============================================================
  // 1. UFF PARAMETER TABLE
  // ============================================================
  // Each entry: [r1, theta0, x1, D1, zeta, Z1, Vi, Uj, Xi, Hard, Radius]
  //   r1      Å    single-bond covalent radius
  //   theta0  deg  natural bond angle
  //   x1      Å    vdW equilibrium distance
  //   D1      kcal/mol  vdW well depth
  //   zeta    –    vdW shape exponent (12.0 for standard LJ)
  //   Z1      –    effective charge (for bond force constant)
  //   Vi      kcal/mol  sp3 torsional barrier parameter
  //   Uj      kcal/mol  sp2 torsional barrier parameter
  //   Xi      eV   GMP electronegativity (for QEq charges)
  //   Hard    eV   GMP hardness
  //   Radius  Å    GMP covalent radius
  //
  // Atom type naming: Element + hybridisation, e.g. C_3 = sp3 carbon

  const UFF_PARAMS = {
    // Complete UFF parameter table — 126 atom types from Rappé et al. JACS 1992
    // Values verified against the RDKit implementation (Code/ForceField/UFF/Params.cpp)
    //                  r1      theta0   x1     D1     zeta    Z1     Vi     Uj      Xi      Hard    Radius

    // --- Period 1 ---
    'H_':     [0.354, 180.0,  2.886, 0.044, 12.0,   0.712, 0.0,   0.0,   4.528,  6.9452, 0.371],
    'H_b':    [0.460, 83.5,   2.886, 0.044, 12.0,   0.712, 0.0,   0.0,   4.528,  6.9452, 0.371],
    'He4+4':  [0.849, 90.0,   2.362, 0.056, 15.24,  0.098, 0.0,   0.0,   9.66,   14.92,  1.3],

    // --- Period 2 ---
    'Li':     [1.336, 180.0,  2.451, 0.025, 12.0,   1.026, 0.0,   2.0,   3.006,  2.386,  1.557],
    'Be3+2':  [1.074, 109.47, 2.745, 0.085, 12.0,   1.565, 0.0,   2.0,   4.877,  4.443,  1.24],
    'B_3':    [0.838, 109.47, 4.083, 0.180, 12.052, 1.755, 0.0,   2.0,   5.11,   4.75,   0.822],
    'B_2':    [0.828, 120.0,  4.083, 0.180, 12.052, 1.755, 0.0,   2.0,   5.11,   4.75,   0.822],
    'C_3':    [0.757, 109.47, 3.851, 0.105, 12.73,  1.912, 2.119, 2.0,   5.343,  5.063,  0.759],
    'C_R':    [0.729, 120.0,  3.851, 0.105, 12.73,  1.912, 0.0,   2.0,   5.343,  5.063,  0.759],
    'C_2':    [0.732, 120.0,  3.851, 0.105, 12.73,  1.912, 0.0,   2.0,   5.343,  5.063,  0.759],
    'C_1':    [0.706, 180.0,  3.851, 0.105, 12.73,  1.912, 0.0,   2.0,   5.343,  5.063,  0.759],
    'N_3':    [0.700, 106.7,  3.660, 0.069, 13.407, 2.544, 0.45,  2.0,   6.899,  5.88,   0.715],
    'N_R':    [0.699, 120.0,  3.660, 0.069, 13.407, 2.544, 0.0,   2.0,   6.899,  5.88,   0.715],
    'N_2':    [0.685, 111.2,  3.660, 0.069, 13.407, 2.544, 0.0,   2.0,   6.899,  5.88,   0.715],
    'N_1':    [0.656, 180.0,  3.660, 0.069, 13.407, 2.544, 0.0,   2.0,   6.899,  5.88,   0.715],
    'O_3':    [0.658, 104.51, 3.500, 0.060, 14.085, 2.300, 0.018, 2.0,   8.741,  6.682,  0.669],
    'O_3_z':  [0.528, 146.0,  3.500, 0.060, 14.085, 2.300, 0.018, 2.0,   8.741,  6.682,  0.669],
    'O_R':    [0.680, 110.0,  3.500, 0.060, 14.085, 2.300, 0.0,   2.0,   8.741,  6.682,  0.669],
    'O_2':    [0.634, 120.0,  3.500, 0.060, 14.085, 2.300, 0.0,   2.0,   8.741,  6.682,  0.669],
    'O_1':    [0.639, 180.0,  3.500, 0.060, 14.085, 2.300, 0.0,   2.0,   8.741,  6.682,  0.669],
    'F_':     [0.668, 180.0,  3.364, 0.050, 14.762, 1.735, 0.0,   2.0,   10.874, 7.474,  0.706],
    'Ne4+4':  [0.920, 90.0,   3.243, 0.042, 15.44,  0.194, 0.0,   2.0,   11.04,  10.55,  1.768],

    // --- Period 3 ---
    'Na':     [1.539, 180.0,  2.983, 0.030, 12.0,   1.081, 0.0,   1.25,  2.843,  2.296,  2.085],
    'Mg3+2':  [1.421, 109.47, 3.021, 0.111, 12.0,   1.787, 0.0,   1.25,  3.951,  3.693,  1.5],
    'Al3':    [1.244, 109.47, 4.499, 0.505, 11.278, 1.792, 0.0,   1.25,  4.06,   3.59,   1.201],
    'Si3':    [1.117, 109.47, 4.295, 0.402, 12.175, 2.323, 1.225, 1.25,  4.168,  3.487,  1.176],
    'P_3+3':  [1.101, 93.8,   4.147, 0.305, 13.072, 2.863, 2.4,   1.25,  5.463,  4.0,    1.102],
    'P_3+5':  [1.056, 109.47, 4.147, 0.305, 13.072, 2.863, 2.4,   1.25,  5.463,  4.0,    1.102],
    'P_3+q':  [1.056, 109.47, 4.147, 0.305, 13.072, 2.863, 2.4,   1.25,  5.463,  4.0,    1.102],
    'S_3+2':  [1.064, 92.1,   4.035, 0.274, 13.969, 2.703, 0.484, 1.25,  6.928,  4.486,  1.047],
    'S_3+4':  [1.049, 103.2,  4.035, 0.274, 13.969, 2.703, 0.484, 1.25,  6.928,  4.486,  1.047],
    'S_3+6':  [1.027, 109.47, 4.035, 0.274, 13.969, 2.703, 0.484, 1.25,  6.928,  4.486,  1.047],
    'S_R':    [1.077, 92.2,   4.035, 0.274, 13.969, 2.703, 0.0,   1.25,  6.928,  4.486,  1.047],
    'S_2':    [0.854, 120.0,  4.035, 0.274, 13.969, 2.703, 0.0,   1.25,  6.928,  4.486,  1.047],
    'Cl':     [1.044, 180.0,  3.947, 0.227, 14.866, 2.348, 0.0,   1.25,  8.564,  4.946,  0.994],
    'Ar4+4':  [1.032, 90.0,   3.868, 0.185, 15.763, 0.300, 0.0,   1.25,  9.465,  6.355,  2.108],

    // --- Period 4 ---
    'K_':     [1.953, 180.0,  3.812, 0.035, 12.0,   1.165, 0.0,   0.7,   2.421,  1.92,   2.586],
    'Ca6+2':  [1.761, 90.0,   3.399, 0.238, 12.0,   2.141, 0.0,   0.7,   3.231,  2.88,   2.0],
    'Sc3+3':  [1.513, 109.47, 3.295, 0.019, 12.0,   2.592, 0.0,   0.7,   3.395,  3.08,   1.75],
    'Ti3+4':  [1.412, 109.47, 3.175, 0.017, 12.0,   2.659, 0.0,   0.7,   3.47,   3.38,   1.607],
    'Ti6+4':  [1.412, 90.0,   3.175, 0.017, 12.0,   2.659, 0.0,   0.7,   3.47,   3.38,   1.607],
    'V_3+5':  [1.402, 109.47, 3.144, 0.016, 12.0,   2.679, 0.0,   0.7,   3.65,   3.41,   1.47],
    'Cr6+3':  [1.345, 90.0,   3.023, 0.015, 12.0,   2.463, 0.0,   0.7,   3.415,  3.865,  1.402],
    'Mn6+2':  [1.382, 90.0,   2.961, 0.013, 12.0,   2.43,  0.0,   0.7,   3.325,  4.105,  1.533],
    'Fe3+2':  [1.270, 109.47, 2.912, 0.013, 12.0,   2.43,  0.0,   0.7,   3.76,   4.14,   1.393],
    'Fe6+2':  [1.335, 90.0,   2.912, 0.013, 12.0,   2.43,  0.0,   0.7,   3.76,   4.14,   1.393],
    'Co6+3':  [1.241, 90.0,   2.872, 0.014, 12.0,   2.43,  0.0,   0.7,   4.105,  4.175,  1.406],
    'Ni4+2':  [1.164, 90.0,   2.834, 0.015, 12.0,   2.43,  0.0,   0.7,   4.465,  4.205,  1.398],
    'Cu3+1':  [1.302, 109.47, 3.495, 0.005, 12.0,   1.756, 0.0,   0.7,   4.2,    4.22,   1.434],
    'Zn3+2':  [1.193, 109.47, 2.763, 0.124, 12.0,   1.308, 0.0,   0.7,   5.106,  4.285,  1.4],
    'Ga3+3':  [1.260, 109.47, 4.383, 0.415, 11.0,   1.821, 0.0,   0.7,   3.641,  3.16,   1.211],
    'Ge3':    [1.197, 109.47, 4.280, 0.379, 12.0,   2.789, 0.701, 0.7,   4.051,  3.438,  1.189],
    'As3+3':  [1.211, 92.1,   4.230, 0.309, 13.0,   2.864, 1.5,   0.7,   5.188,  3.809,  1.204],
    'Se3+2':  [1.190, 90.6,   4.205, 0.291, 14.0,   2.764, 0.335, 0.7,   6.428,  4.131,  1.224],
    'Br':     [1.192, 180.0,  4.189, 0.251, 15.0,   2.519, 0.0,   0.7,   7.79,   4.425,  1.141],
    'Kr4+4':  [1.147, 90.0,   4.141, 0.220, 16.0,   0.452, 0.0,   0.7,   8.505,  5.715,  2.27],

    // --- Period 5 ---
    'Rb':     [2.260, 180.0,  4.114, 0.040, 12.0,   1.592, 0.0,   0.2,   2.331,  1.846,  2.77],
    'Sr6+2':  [2.052, 90.0,   3.641, 0.235, 12.0,   2.449, 0.0,   0.2,   3.024,  2.44,   2.415],
    'Y_3+3':  [1.698, 109.47, 3.345, 0.072, 12.0,   3.257, 0.0,   0.2,   3.83,   2.81,   1.998],
    'Zr3+4':  [1.564, 109.47, 3.124, 0.069, 12.0,   3.667, 0.0,   0.2,   3.4,    3.55,   1.758],
    'Nb3+5':  [1.473, 109.47, 3.165, 0.059, 12.0,   3.618, 0.0,   0.2,   3.55,   3.38,   1.603],
    'Mo6+6':  [1.467, 90.0,   3.052, 0.056, 12.0,   3.4,   0.0,   0.2,   3.465,  3.755,  1.53],
    'Mo3+6':  [1.484, 109.47, 3.052, 0.056, 12.0,   3.4,   0.0,   0.2,   3.465,  3.755,  1.53],
    'Tc6+5':  [1.322, 90.0,   2.998, 0.048, 12.0,   3.4,   0.0,   0.2,   3.29,   3.99,   1.5],
    'Ru6+2':  [1.478, 90.0,   2.963, 0.056, 12.0,   3.4,   0.0,   0.2,   3.575,  4.015,  1.5],
    'Rh6+3':  [1.332, 90.0,   2.929, 0.053, 12.0,   3.5,   0.0,   0.2,   3.975,  4.005,  1.509],
    'Pd4+2':  [1.338, 90.0,   2.899, 0.048, 12.0,   3.21,  0.0,   0.2,   4.32,   4.0,    1.544],
    'Ag1+1':  [1.386, 180.0,  3.148, 0.036, 12.0,   1.956, 0.0,   0.2,   4.436,  3.134,  1.622],
    'Cd3+2':  [1.403, 109.47, 2.848, 0.228, 12.0,   1.65,  0.0,   0.2,   5.034,  3.957,  1.6],
    'In3+3':  [1.459, 109.47, 4.463, 0.599, 11.0,   2.07,  0.0,   0.2,   3.506,  2.896,  1.404],
    'Sn3':    [1.398, 109.47, 4.392, 0.567, 12.0,   2.961, 0.199, 0.2,   3.987,  3.124,  1.354],
    'Sb3+3':  [1.407, 91.6,   4.420, 0.449, 13.0,   2.704, 1.1,   0.2,   4.899,  3.342,  1.404],
    'Te3+2':  [1.386, 90.25,  4.470, 0.398, 14.0,   2.882, 0.3,   0.2,   5.816,  3.526,  1.38],
    'I_':     [1.382, 180.0,  4.500, 0.339, 15.0,   2.65,  0.0,   0.2,   6.822,  3.762,  1.333],
    'Xe4+4':  [1.267, 90.0,   4.404, 0.332, 12.0,   0.556, 0.0,   0.2,   7.595,  4.975,  2.459],

    // --- Period 6 ---
    'Cs':     [2.570, 180.0,  4.517, 0.045, 12.0,   1.573, 0.0,   0.1,   2.183,  1.711,  2.984],
    'Ba6+2':  [2.277, 90.0,   3.703, 0.364, 12.0,   2.727, 0.0,   0.1,   2.814,  2.396,  2.442],
    'La3+3':  [1.943, 109.47, 3.522, 0.017, 12.0,   3.3,   0.0,   0.1,   2.8355, 2.7415, 2.071],
    'Ce6+3':  [1.841, 90.0,   3.556, 0.013, 12.0,   3.3,   0.0,   0.1,   2.774,  2.692,  1.925],
    'Pr6+3':  [1.823, 90.0,   3.606, 0.010, 12.0,   3.3,   0.0,   0.1,   2.858,  2.564,  2.007],
    'Nd6+3':  [1.816, 90.0,   3.575, 0.010, 12.0,   3.3,   0.0,   0.1,   2.8685, 2.6205, 2.007],
    'Pm6+3':  [1.801, 90.0,   3.547, 0.009, 12.0,   3.3,   0.0,   0.1,   2.881,  2.673,  2.0],
    'Sm6+3':  [1.780, 90.0,   3.520, 0.008, 12.0,   3.3,   0.0,   0.1,   2.9115, 2.7195, 1.978],
    'Eu6+3':  [1.771, 90.0,   3.493, 0.008, 12.0,   3.3,   0.0,   0.1,   2.8785, 2.7875, 2.227],
    'Gd6+3':  [1.735, 90.0,   3.368, 0.009, 12.0,   3.3,   0.0,   0.1,   3.1665, 2.9745, 1.968],
    'Tb6+3':  [1.732, 90.0,   3.451, 0.007, 12.0,   3.3,   0.0,   0.1,   3.018,  2.834,  1.954],
    'Dy6+3':  [1.710, 90.0,   3.428, 0.007, 12.0,   3.3,   0.0,   0.1,   3.0555, 2.8715, 1.934],
    'Ho6+3':  [1.696, 90.0,   3.409, 0.007, 12.0,   3.416, 0.0,   0.1,   3.127,  2.891,  1.925],
    'Er6+3':  [1.673, 90.0,   3.391, 0.007, 12.0,   3.3,   0.0,   0.1,   3.1865, 2.9145, 1.915],
    'Tm6+3':  [1.660, 90.0,   3.374, 0.006, 12.0,   3.3,   0.0,   0.1,   3.2514, 2.9329, 2.0],
    'Yb6+3':  [1.637, 90.0,   3.355, 0.228, 12.0,   2.618, 0.0,   0.1,   3.2889, 2.965,  2.158],
    'Lu6+3':  [1.671, 90.0,   3.640, 0.041, 12.0,   3.271, 0.0,   0.1,   2.9629, 2.4629, 1.896],
    'Hf3+4':  [1.611, 109.47, 3.141, 0.072, 12.0,   3.921, 0.0,   0.1,   3.7,    3.4,    1.759],
    'Ta3+5':  [1.511, 109.47, 3.170, 0.081, 12.0,   4.075, 0.0,   0.1,   5.1,    2.85,   1.605],
    'W_6+6':  [1.392, 90.0,   3.069, 0.067, 12.0,   3.7,   0.0,   0.1,   4.63,   3.31,   1.538],
    'W_3+4':  [1.526, 109.47, 3.069, 0.067, 12.0,   3.7,   0.0,   0.1,   4.63,   3.31,   1.538],
    'W_3+6':  [1.380, 109.47, 3.069, 0.067, 12.0,   3.7,   0.0,   0.1,   4.63,   3.31,   1.538],
    'Re6+5':  [1.372, 90.0,   2.954, 0.066, 12.0,   3.7,   0.0,   0.1,   3.96,   3.92,   1.6],
    'Re3+7':  [1.314, 109.47, 2.954, 0.066, 12.0,   3.7,   0.0,   0.1,   3.96,   3.92,   1.6],
    'Os6+6':  [1.372, 90.0,   3.120, 0.037, 12.0,   3.7,   0.0,   0.1,   5.14,   3.63,   1.7],
    'Ir6+3':  [1.371, 90.0,   2.840, 0.073, 12.0,   3.731, 0.0,   0.1,   5.0,    4.0,    1.866],
    'Pt4+2':  [1.364, 90.0,   2.754, 0.080, 12.0,   3.382, 0.0,   0.1,   4.79,   4.43,   1.557],
    'Au4+3':  [1.262, 90.0,   3.293, 0.039, 12.0,   2.625, 0.0,   0.1,   4.894,  2.586,  1.618],
    'Hg1+2':  [1.340, 180.0,  2.705, 0.385, 12.0,   1.75,  0.0,   0.1,   6.27,   4.16,   1.6],
    'Tl3+3':  [1.518, 120.0,  4.347, 0.680, 11.0,   2.068, 0.0,   0.1,   3.2,    2.9,    1.53],
    'Pb3':    [1.459, 109.47, 4.297, 0.663, 12.0,   2.846, 0.1,   0.1,   3.9,    3.53,   1.444],
    'Bi3+3':  [1.512, 90.0,   4.370, 0.518, 13.0,   2.47,  1.0,   0.1,   4.69,   3.74,   1.514],
    'Po3+2':  [1.500, 90.0,   4.709, 0.325, 14.0,   2.33,  0.3,   0.1,   4.21,   4.21,   1.48],
    'At':     [1.545, 180.0,  4.750, 0.284, 15.0,   2.24,  0.0,   0.1,   4.75,   4.75,   1.47],
    'Rn4+4':  [1.420, 90.0,   4.765, 0.248, 16.0,   0.583, 0.0,   0.1,   5.37,   5.37,   2.2],

    // --- Period 7 ---
    'Fr':     [2.880, 180.0,  4.900, 0.050, 12.0,   1.847, 0.0,   0.0,   2.0,    2.0,    2.3],
    'Ra6+2':  [2.512, 90.0,   3.677, 0.404, 12.0,   2.92,  0.0,   0.0,   2.843,  2.434,  2.2],
    'Ac6+3':  [1.983, 90.0,   3.478, 0.033, 12.0,   3.9,   0.0,   0.0,   2.835,  2.835,  2.108],
    'Th6+4':  [1.721, 90.0,   3.396, 0.026, 12.0,   4.202, 0.0,   0.0,   3.175,  2.905,  2.018],
    'Pa6+4':  [1.711, 90.0,   3.424, 0.022, 12.0,   3.9,   0.0,   0.0,   2.985,  2.905,  1.8],
    'U_6+4':  [1.684, 90.0,   3.395, 0.022, 12.0,   3.9,   0.0,   0.0,   3.341,  2.853,  1.713],
    'Np6+4':  [1.666, 90.0,   3.424, 0.019, 12.0,   3.9,   0.0,   0.0,   3.549,  2.717,  1.8],
    'Pu6+4':  [1.657, 90.0,   3.424, 0.016, 12.0,   3.9,   0.0,   0.0,   3.243,  2.819,  1.84],
    'Am6+4':  [1.660, 90.0,   3.381, 0.014, 12.0,   3.9,   0.0,   0.0,   2.9895, 3.0035, 1.942],
    'Cm6+3':  [1.801, 90.0,   3.326, 0.013, 12.0,   3.9,   0.0,   0.0,   2.8315, 3.1895, 1.9],
    'Bk6+3':  [1.761, 90.0,   3.339, 0.013, 12.0,   3.9,   0.0,   0.0,   3.1935, 3.0355, 1.9],
    'Cf6+3':  [1.750, 90.0,   3.313, 0.013, 12.0,   3.9,   0.0,   0.0,   3.197,  3.101,  1.9],
    'Es6+3':  [1.724, 90.0,   3.299, 0.012, 12.0,   3.9,   0.0,   0.0,   3.333,  3.089,  1.9],
    'Fm6+3':  [1.712, 90.0,   3.286, 0.012, 12.0,   3.9,   0.0,   0.0,   3.4,    3.1,    1.9],
    'Md6+3':  [1.689, 90.0,   3.274, 0.011, 12.0,   3.9,   0.0,   0.0,   3.47,   3.11,   1.9],
    'No6+3':  [1.679, 90.0,   3.248, 0.011, 12.0,   3.9,   0.0,   0.0,   3.475,  3.175,  1.9],
    'Lw6+3':  [1.698, 90.0,   3.236, 0.011, 12.0,   3.9,   0.0,   0.0,   3.5,    3.2,    1.9],
  };

  const R1 = 0, THETA0 = 1, X1 = 2, D1 = 3, ZETA = 4, Z1 = 5;
  const VI = 6, UJ = 7, XI = 8, HARD = 9, RADIUS = 10;
  const DEG2RAD = Math.PI / 180.0;

  const ELEMENT_TO_UFF = {
    'H': 'H_', 'He': 'He4+4', 'Li': 'Li', 'Be': 'Be3+2',
    'B': { 3: 'B_3', 2: 'B_2', default: 'B_3' },
    'C': { 4: 'C_3', 3: 'C_2', 2: 'C_1', 1: 'C_1', default: 'C_3' },
    'N': { 3: 'N_3', 2: 'N_2', 1: 'N_1', default: 'N_3' },
    'O': { 2: 'O_3', 1: 'O_2', default: 'O_3' },
    'F': 'F_', 'Ne': 'Ne4+4', 'Na': 'Na', 'Mg': 'Mg3+2', 'Al': 'Al3', 'Si': 'Si3',
    'P': 'P_3+3', 'S': { 2: 'S_3+2', 3: 'S_3+4', 4: 'S_3+6', default: 'S_3+2' },
    'Cl': 'Cl', 'Ar': 'Ar4+4', 'K': 'K_', 'Ca': 'Ca6+2', 'Sc': 'Sc3+3',
    'Ti': { 4: 'Ti3+4', default: 'Ti6+4' }, 'V': 'V_3+5', 'Cr': 'Cr6+3', 'Mn': 'Mn6+2',
    'Fe': { default: 'Fe3+2' }, 'Co': 'Co6+3', 'Ni': 'Ni4+2', 'Cu': 'Cu3+1', 'Zn': 'Zn3+2',
    'Ga': 'Ga3+3', 'Ge': 'Ge3', 'As': 'As3+3', 'Se': 'Se3+2', 'Br': 'Br', 'Kr': 'Kr4+4',
    'Rb': 'Rb', 'Sr': 'Sr6+2', 'Y': 'Y_3+3', 'Zr': 'Zr3+4', 'Nb': 'Nb3+5',
    'Mo': { default: 'Mo6+6' }, 'Tc': 'Tc6+5', 'Ru': 'Ru6+2', 'Rh': 'Rh6+3', 'Pd': 'Pd4+2',
    'Ag': 'Ag1+1', 'Cd': 'Cd3+2', 'In': 'In3+3', 'Sn': 'Sn3', 'Sb': 'Sb3+3', 'Te': 'Te3+2',
    'I': 'I_', 'Xe': 'Xe4+4', 'Cs': 'Cs', 'Ba': 'Ba6+2', 'La': 'La3+3', 'Ce': 'Ce6+3',
    'Pr': 'Pr6+3', 'Nd': 'Nd6+3', 'Pm': 'Pm6+3', 'Sm': 'Sm6+3', 'Eu': 'Eu6+3', 'Gd': 'Gd6+3',
    'Tb': 'Tb6+3', 'Dy': 'Dy6+3', 'Ho': 'Ho6+3', 'Er': 'Er6+3', 'Tm': 'Tm6+3', 'Yb': 'Yb6+3',
    'Lu': 'Lu6+3', 'Hf': 'Hf3+4', 'Ta': 'Ta3+5', 'W': { default: 'W_6+6' }, 'Re': { default: 'Re6+5' },
    'Os': 'Os6+6', 'Ir': 'Ir6+3', 'Pt': 'Pt4+2', 'Au': 'Au4+3', 'Hg': 'Hg1+2', 'Tl': 'Tl3+3',
    'Pb': 'Pb3', 'Bi': 'Bi3+3', 'Po': 'Po3+2', 'At': 'At', 'Rn': 'Rn4+4', 'Fr': 'Fr', 'Ra': 'Ra6+2',
    'Ac': 'Ac6+3', 'Th': 'Th6+4', 'Pa': 'Pa6+4', 'U': 'U_6+4', 'Np': 'Np6+4', 'Pu': 'Pu6+4',
    'Am': 'Am6+4', 'Cm': 'Cm6+3', 'Bk': 'Bk6+3', 'Cf': 'Cf6+3', 'Es': 'Es6+3', 'Fm': 'Fm6+3',
    'Md': 'Md6+3', 'No': 'No6+3', 'Lr': 'Lw6+3',
  };

  function assignAtomType(element, nBonds) {
    const entry = ELEMENT_TO_UFF[element];
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return entry[nBonds] || entry.default;
  }

  function getParams(atomType) {
    return UFF_PARAMS[atomType] || null;
  }

  function dist(xyz, i, j) {
    const i3 = 3 * i;
    const j3 = 3 * j;
    const dx = xyz[j3] - xyz[i3];
    const dy = xyz[j3 + 1] - xyz[i3 + 1];
    const dz = xyz[j3 + 2] - xyz[i3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function angle(xyz, i, j, k) {
    const j3 = 3 * j;
    const ux = xyz[3 * i] - xyz[j3];
    const uy = xyz[3 * i + 1] - xyz[j3 + 1];
    const uz = xyz[3 * i + 2] - xyz[j3 + 2];
    const vx = xyz[3 * k] - xyz[j3];
    const vy = xyz[3 * k + 1] - xyz[j3 + 1];
    const vz = xyz[3 * k + 2] - xyz[j3 + 2];
    const dot = ux * vx + uy * vy + uz * vz;
    const ru = Math.sqrt(ux * ux + uy * uy + uz * uz);
    const rv = Math.sqrt(vx * vx + vy * vy + vz * vz);
    let cosT = dot / (ru * rv);
    cosT = Math.max(-1.0, Math.min(1.0, cosT));
    return Math.acos(cosT);
  }

  function dihedral(xyz, i, j, k, l) {
    const b1x = xyz[3 * j] - xyz[3 * i], b1y = xyz[3 * j + 1] - xyz[3 * i + 1], b1z = xyz[3 * j + 2] - xyz[3 * i + 2];
    const b2x = xyz[3 * k] - xyz[3 * j], b2y = xyz[3 * k + 1] - xyz[3 * j + 1], b2z = xyz[3 * k + 2] - xyz[3 * j + 2];
    const b3x = xyz[3 * l] - xyz[3 * k], b3y = xyz[3 * l + 1] - xyz[3 * k + 1], b3z = xyz[3 * l + 2] - xyz[3 * k + 2];
    const n1x = b1y * b2z - b1z * b2y, n1y = b1z * b2x - b1x * b2z, n1z = b1x * b2y - b1y * b2x;
    const n2x = b2y * b3z - b2z * b3y, n2y = b2z * b3x - b2x * b3z, n2z = b2x * b3y - b2y * b3x;
    const m1x = n1y * b2z - n1z * b2y, m1y = n1z * b2x - n1x * b2z, m1z = n1x * b2y - n1y * b2x;
    const rb2 = Math.sqrt(b2x * b2x + b2y * b2y + b2z * b2z);
    const x = n1x * n2x + n1y * n2y + n1z * n2z;
    const y = (m1x * n2x + m1y * n2y + m1z * n2z) / rb2;
    return Math.atan2(y, x);
  }

  function buildTopology(nAtoms, bonds) {
    const adj = Array.from({ length: nAtoms }, () => []);
    for (const [a, b] of bonds) {
      adj[a].push(b);
      adj[b].push(a);
    }

    const angleSet = new Set();
    const angles = [];
    for (let j = 0; j < nAtoms; j += 1) {
      const nbrs = adj[j];
      for (let a = 0; a < nbrs.length; a += 1) {
        for (let b = a + 1; b < nbrs.length; b += 1) {
          const i = nbrs[a];
          const k = nbrs[b];
          const key = `${Math.min(i, k)}-${j}-${Math.max(i, k)}`;
          if (!angleSet.has(key)) {
            angleSet.add(key);
            angles.push([i, j, k]);
          }
        }
      }
    }

    const dihedralSet = new Set();
    const dihedrals = [];
    for (const [j, k] of bonds) {
      for (const i of adj[j]) {
        if (i === k) continue;
        for (const l of adj[k]) {
          if (l === j || l === i) continue;
          const key = [i, j, k, l].join('-');
          const revKey = [l, k, j, i].join('-');
          if (!dihedralSet.has(key) && !dihedralSet.has(revKey)) {
            dihedralSet.add(key);
            dihedrals.push([i, j, k, l]);
          }
        }
      }
    }

    const exclusions = new Set();
    for (const [a, b] of bonds) exclusions.add(Math.min(a, b) + '-' + Math.max(a, b));
    for (const [i, , k] of angles) exclusions.add(Math.min(i, k) + '-' + Math.max(i, k));

    return { adj, angles, dihedrals, exclusions };
  }

  function guessBondOrder(rActual, rSingle) {
    if (rActual >= rSingle * 0.95) return 1.0;
    if (rActual >= rSingle * 0.82) return 1.5;
    if (rActual >= rSingle * 0.72) return 2.0;
    return 3.0;
  }

  function naturalBondLength(pi, pj, bondOrder) {
    const ri = pi[R1];
    const rj = pj[R1];
    const rBO = -0.1332 * (ri + rj) * Math.log(bondOrder);
    const sqXi = Math.sqrt(pi[XI]);
    const sqXj = Math.sqrt(pj[XI]);
    const dEN = sqXi - sqXj;
    const rEN = ri * rj * dEN * dEN / (pi[XI] * ri + pj[XI] * rj);
    return ri + rj + rBO - rEN;
  }

  function bondForceConstant(pi, pj, r0) {
    return 664.12 * pi[Z1] * pj[Z1] / (r0 * r0 * r0);
  }

  function bondEnergy(xyz, sys) {
    let E = 0.0;
    for (const b of sys.bondTerms) {
      const r = dist(xyz, b.i, b.j);
      const dr = r - b.r0;
      E += 0.5 * b.k * dr * dr;
    }
    return E;
  }

  function bondGradient(xyz, grad, sys) {
    for (const b of sys.bondTerms) {
      const i3 = 3 * b.i;
      const j3 = 3 * b.j;
      const dx = xyz[j3] - xyz[i3], dy = xyz[j3 + 1] - xyz[i3 + 1], dz = xyz[j3 + 2] - xyz[i3 + 2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r < 1e-10) continue;
      const dr = r - b.r0;
      const dEdr = b.k * dr / r;
      grad[i3] -= dEdr * dx; grad[i3 + 1] -= dEdr * dy; grad[i3 + 2] -= dEdr * dz;
      grad[j3] += dEdr * dx; grad[j3 + 1] += dEdr * dy; grad[j3 + 2] += dEdr * dz;
    }
  }

  function angleForceConstant(pi, pj, pk, rij, rjk, theta0) {
    const cosT0 = Math.cos(theta0);
    const sinT0Sq = 1.0 - cosT0 * cosT0;
    if (sinT0Sq < 1e-10) return 664.12 * pi[Z1] * pk[Z1] / (rij * rjk * rjk * rjk * rjk);
    const rjk2 = rjk * rjk;
    const rijRjk = rij * rjk;
    const numerator = 3.0 * rijRjk * sinT0Sq - rjk2 * cosT0;
    return 664.12 * pi[Z1] * pk[Z1] / (rijRjk * rijRjk * rijRjk) * numerator / sinT0Sq;
  }

  function angleEnergy(xyz, sys) {
    let E = 0.0;
    for (const a of sys.angleTerms) {
      const theta = angle(xyz, a.i, a.j, a.k);
      const cosT = Math.cos(theta);
      E += a.K * (a.C0 + a.C1 * cosT + a.C2 * Math.cos(2 * theta));
    }
    return E;
  }

  function angleGradient(xyz, grad, sys) {
    for (const a of sys.angleTerms) {
      const i = a.i, j = a.j, k = a.k;
      const j3 = 3 * j;
      const ux = xyz[3 * i] - xyz[j3], uy = xyz[3 * i + 1] - xyz[j3 + 1], uz = xyz[3 * i + 2] - xyz[j3 + 2];
      const vx = xyz[3 * k] - xyz[j3], vy = xyz[3 * k + 1] - xyz[j3 + 1], vz = xyz[3 * k + 2] - xyz[j3 + 2];
      const ru = Math.sqrt(ux * ux + uy * uy + uz * uz);
      const rv = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (ru < 1e-10 || rv < 1e-10) continue;
      let cosT = (ux * vx + uy * vy + uz * vz) / (ru * rv);
      cosT = Math.max(-0.9999999, Math.min(0.9999999, cosT));
      const sinT = Math.sqrt(1.0 - cosT * cosT);
      if (sinT < 1e-10) continue;
      const dEdtheta = a.K * (-a.C1 * sinT - 2.0 * a.C2 * Math.sin(2.0 * Math.acos(cosT)));
      const dEdcosT = -dEdtheta / sinT;
      const iru = 1.0 / ru, irv = 1.0 / rv;
      const facI = dEdcosT * iru;
      const facK = dEdcosT * irv;
      for (let d = 0; d < 3; d += 1) {
        const ud = d === 0 ? ux : d === 1 ? uy : uz;
        const vd = d === 0 ? vx : d === 1 ? vy : vz;
        const di = facI * (vd * irv - cosT * ud * iru);
        const dk = facK * (ud * iru - cosT * vd * irv);
        grad[3 * i + d] += di;
        grad[3 * k + d] += dk;
        grad[3 * j + d] -= (di + dk);
      }
    }
  }

  function torsionBarrier(pj, pk, bondOrder) {
    const vj = pj[VI], vk = pk[VI];
    const uj = pj[UJ], uk = pk[UJ];
    if (vj > 0 && vk > 0) return { V: Math.sqrt(vj * vk), n: 3 };
    if (uj > 0 && uk > 0) return { V: 5.0 * Math.sqrt(uj * uk) * (1.0 + 4.18 * Math.log(bondOrder)), n: 2 };
    if (uj > 0 && vk > 0) return { V: Math.sqrt(uj * vk), n: 6 };
    if (vj > 0 && uk > 0) return { V: Math.sqrt(vj * uk), n: 6 };
    return { V: 0.0, n: 2 };
  }

  function torsionEnergy(xyz, sys) {
    let E = 0.0;
    for (const t of sys.torsionTerms) {
      const phi = dihedral(xyz, t.i, t.j, t.k, t.l);
      E += 0.5 * t.V * (1.0 - t.cosPhi0 * Math.cos(t.n * phi));
    }
    return E;
  }

  function torsionGradient(xyz, grad, sys) {
    const EPS = 1e-6;
    for (const t of sys.torsionTerms) {
      const atoms = [t.i, t.j, t.k, t.l];
      for (const a of atoms) {
        for (let d = 0; d < 3; d += 1) {
          const idx = 3 * a + d;
          const orig = xyz[idx];
          xyz[idx] = orig + EPS;
          const phiP = dihedral(xyz, t.i, t.j, t.k, t.l);
          const Ep = 0.5 * t.V * (1.0 - t.cosPhi0 * Math.cos(t.n * phiP));
          xyz[idx] = orig - EPS;
          const phiM = dihedral(xyz, t.i, t.j, t.k, t.l);
          const Em = 0.5 * t.V * (1.0 - t.cosPhi0 * Math.cos(t.n * phiM));
          xyz[idx] = orig;
          grad[idx] += (Ep - Em) / (2.0 * EPS);
        }
      }
    }
  }

  function calculateCosY(xyz, i, j, k, l) {
    const j3 = 3 * j;
    const jix = xyz[3 * i] - xyz[j3], jiy = xyz[3 * i + 1] - xyz[j3 + 1], jiz = xyz[3 * i + 2] - xyz[j3 + 2];
    const jkx = xyz[3 * k] - xyz[j3], jky = xyz[3 * k + 1] - xyz[j3 + 1], jkz = xyz[3 * k + 2] - xyz[j3 + 2];
    const jlx = xyz[3 * l] - xyz[j3], jly = xyz[3 * l + 1] - xyz[j3 + 1], jlz = xyz[3 * l + 2] - xyz[j3 + 2];
    const nx = (-jiy) * jkz - (-jiz) * jky;
    const ny = (-jiz) * jkx - (-jix) * jkz;
    const nz = (-jix) * jky - (-jiy) * jkx;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const jlLen = Math.sqrt(jlx * jlx + jly * jly + jlz * jlz);
    if (nLen < 1e-10 || jlLen < 1e-10) return 0.0;
    let cosY = (nx * jlx + ny * jly + nz * jlz) / (nLen * jlLen);
    cosY = Math.max(-1.0, Math.min(1.0, cosY));
    return cosY;
  }

  function inversionEnergy(xyz, sys) {
    let E = 0.0;
    for (const inv of Array.isArray(sys.inversionTerms) ? sys.inversionTerms : []) {
      const cosY = calculateCosY(xyz, inv.i, inv.j, inv.k, inv.l);
      const sinYSq = 1.0 - cosY * cosY;
      const sinY = sinYSq > 0.0 ? Math.sqrt(sinYSq) : 0.0;
      const cos2W = 2.0 * sinY * sinY - 1.0;
      E += inv.K * (inv.C0 + inv.C1 * sinY + inv.C2 * cos2W);
    }
    return E;
  }

  function inversionGradient(xyz, grad, sys) {
    for (const inv of Array.isArray(sys.inversionTerms) ? sys.inversionTerms : []) {
      const i = inv.i, j = inv.j, k = inv.k, l = inv.l;
      const j3 = 3 * j;
      let rJIx = xyz[3 * i] - xyz[j3], rJIy = xyz[3 * i + 1] - xyz[j3 + 1], rJIz = xyz[3 * i + 2] - xyz[j3 + 2];
      let rJKx = xyz[3 * k] - xyz[j3], rJKy = xyz[3 * k + 1] - xyz[j3 + 1], rJKz = xyz[3 * k + 2] - xyz[j3 + 2];
      let rJLx = xyz[3 * l] - xyz[j3], rJLy = xyz[3 * l + 1] - xyz[j3 + 1], rJLz = xyz[3 * l + 2] - xyz[j3 + 2];

      const dJI = Math.sqrt(rJIx * rJIx + rJIy * rJIy + rJIz * rJIz);
      const dJK = Math.sqrt(rJKx * rJKx + rJKy * rJKy + rJKz * rJKz);
      const dJL = Math.sqrt(rJLx * rJLx + rJLy * rJLy + rJLz * rJLz);
      if (dJI < 1e-10 || dJK < 1e-10 || dJL < 1e-10) continue;

      rJIx /= dJI; rJIy /= dJI; rJIz /= dJI;
      rJKx /= dJK; rJKy /= dJK; rJKz /= dJK;
      rJLx /= dJL; rJLy /= dJL; rJLz /= dJL;

      let nx = (-rJIy) * rJKz - (-rJIz) * rJKy;
      let ny = (-rJIz) * rJKx - (-rJIx) * rJKz;
      let nz = (-rJIx) * rJKy - (-rJIy) * rJKx;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nLen < 1e-10) continue;
      nx /= nLen; ny /= nLen; nz /= nLen;

      let cosY = nx * rJLx + ny * rJLy + nz * rJLz;
      cosY = Math.max(-0.9999999, Math.min(0.9999999, cosY));
      const sinYSq = 1.0 - cosY * cosY;
      const sinY = Math.max(Math.sqrt(sinYSq), 1.0e-8);

      let cosTheta = rJIx * rJKx + rJIy * rJKy + rJIz * rJKz;
      cosTheta = Math.max(-0.9999999, Math.min(0.9999999, cosTheta));
      const sinThetaSq = 1.0 - cosTheta * cosTheta;
      const sinTheta = Math.max(Math.sqrt(sinThetaSq), 1.0e-8);

      const dE_dW = -inv.K * (inv.C1 * cosY - 4.0 * inv.C2 * cosY * sinY);

      const t1x = rJLy * rJKz - rJLz * rJKy, t1y = rJLz * rJKx - rJLx * rJKz, t1z = rJLx * rJKy - rJLy * rJKx;
      const t2x = rJIy * rJLz - rJIz * rJLy, t2y = rJIz * rJLx - rJIx * rJLz, t2z = rJIx * rJLy - rJIy * rJLx;
      const t3x = rJKy * rJIz - rJKz * rJIy, t3y = rJKz * rJIx - rJKx * rJIz, t3z = rJKx * rJIy - rJKy * rJIx;

      const term1 = sinY * sinTheta;
      const term2 = cosY / (sinY * sinThetaSq);

      const tg1x = (t1x / term1 - (rJIx - rJKx * cosTheta) * term2) / dJI;
      const tg1y = (t1y / term1 - (rJIy - rJKy * cosTheta) * term2) / dJI;
      const tg1z = (t1z / term1 - (rJIz - rJKz * cosTheta) * term2) / dJI;

      const tg3x = (t2x / term1 - (rJKx - rJIx * cosTheta) * term2) / dJK;
      const tg3y = (t2y / term1 - (rJKy - rJIy * cosTheta) * term2) / dJK;
      const tg3z = (t2z / term1 - (rJKz - rJIz * cosTheta) * term2) / dJK;

      const cosYSinY = cosY / sinY;
      const tg4x = (t3x / term1 - rJLx * cosYSinY) / dJL;
      const tg4y = (t3y / term1 - rJLy * cosYSinY) / dJL;
      const tg4z = (t3z / term1 - rJLz * cosYSinY) / dJL;

      grad[3 * i] += dE_dW * tg1x;
      grad[3 * i + 1] += dE_dW * tg1y;
      grad[3 * i + 2] += dE_dW * tg1z;
      grad[j3] -= dE_dW * (tg1x + tg3x + tg4x);
      grad[j3 + 1] -= dE_dW * (tg1y + tg3y + tg4y);
      grad[j3 + 2] -= dE_dW * (tg1z + tg3z + tg4z);
      grad[3 * k] += dE_dW * tg3x;
      grad[3 * k + 1] += dE_dW * tg3y;
      grad[3 * k + 2] += dE_dW * tg3z;
      grad[3 * l] += dE_dW * tg4x;
      grad[3 * l + 1] += dE_dW * tg4y;
      grad[3 * l + 2] += dE_dW * tg4z;
    }
  }

  function vdwEnergy(xyz, sys) {
    if (Array.isArray(sys.nonbondedPairs)) {
      let E = 0.0;
      for (const pair of sys.nonbondedPairs) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const i = pair[0] | 0;
        const j = pair[1] | 0;
        if (i < 0 || j <= i || i >= sys.nAtoms || j >= sys.nAtoms) continue;
        const pi = getParams(sys.atomTypes[i]);
        const pj = getParams(sys.atomTypes[j]);
        if (!pi || !pj) continue;
        const i3 = 3 * i, j3 = 3 * j;
        const dx = xyz[j3] - xyz[i3], dy = xyz[j3 + 1] - xyz[i3 + 1], dz = xyz[j3 + 2] - xyz[i3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 > sys.cutoff * sys.cutoff || r2 < 1e-4) continue;
        const xij = Math.sqrt(pi[X1] * pj[X1]);
        const Dij = Math.sqrt(pi[D1] * pj[D1]);
        const ratio2 = (xij * xij) / r2;
        const ratio6 = ratio2 * ratio2 * ratio2;
        E += Dij * (ratio6 * ratio6 - 2.0 * ratio6);
      }
      return E;
    }
    let E = 0.0;
    const n = sys.nAtoms;
    const types = sys.atomTypes;
    const excl = sys.exclusions;
    const cutoff2 = sys.cutoff * sys.cutoff;
    for (let i = 0; i < n; i += 1) {
      const pi = getParams(types[i]);
      if (!pi) continue;
      for (let j = i + 1; j < n; j += 1) {
        if (excl.has(i + '-' + j)) continue;
        const pj = getParams(types[j]);
        if (!pj) continue;
        const i3 = 3 * i, j3 = 3 * j;
        const dx = xyz[j3] - xyz[i3], dy = xyz[j3 + 1] - xyz[i3 + 1], dz = xyz[j3 + 2] - xyz[i3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 > cutoff2 || r2 < 1e-4) continue;
        const xij = Math.sqrt(pi[X1] * pj[X1]);
        const Dij = Math.sqrt(pi[D1] * pj[D1]);
        const ratio2 = (xij * xij) / r2;
        const ratio6 = ratio2 * ratio2 * ratio2;
        E += Dij * (ratio6 * ratio6 - 2.0 * ratio6);
      }
    }
    return E;
  }

  function vdwGradient(xyz, grad, sys) {
    if (Array.isArray(sys.nonbondedPairs)) {
      for (const pair of sys.nonbondedPairs) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const i = pair[0] | 0;
        const j = pair[1] | 0;
        if (i < 0 || j <= i || i >= sys.nAtoms || j >= sys.nAtoms) continue;
        const pi = getParams(sys.atomTypes[i]);
        const pj = getParams(sys.atomTypes[j]);
        if (!pi || !pj) continue;
        const i3 = 3 * i, j3 = 3 * j;
        const dx = xyz[j3] - xyz[i3], dy = xyz[j3 + 1] - xyz[i3 + 1], dz = xyz[j3 + 2] - xyz[i3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 > sys.cutoff * sys.cutoff || r2 < 1e-4) continue;
        const xij = Math.sqrt(pi[X1] * pj[X1]);
        const Dij = Math.sqrt(pi[D1] * pj[D1]);
        const xij2 = xij * xij;
        const ratio2 = xij2 / r2;
        const ratio6 = ratio2 * ratio2 * ratio2;
        const dEdr2 = 6.0 * Dij * (ratio6 - ratio6 * ratio6) / r2;
        const fx = 2.0 * dEdr2 * dx;
        const fy = 2.0 * dEdr2 * dy;
        const fz = 2.0 * dEdr2 * dz;
        grad[i3] -= fx; grad[i3 + 1] -= fy; grad[i3 + 2] -= fz;
        grad[j3] += fx; grad[j3 + 1] += fy; grad[j3 + 2] += fz;
      }
      return;
    }
    const n = sys.nAtoms;
    const types = sys.atomTypes;
    const excl = sys.exclusions;
    const cutoff2 = sys.cutoff * sys.cutoff;
    for (let i = 0; i < n; i += 1) {
      const pi = getParams(types[i]);
      if (!pi) continue;
      for (let j = i + 1; j < n; j += 1) {
        if (excl.has(i + '-' + j)) continue;
        const pj = getParams(types[j]);
        if (!pj) continue;
        const i3 = 3 * i, j3 = 3 * j;
        const dx = xyz[j3] - xyz[i3], dy = xyz[j3 + 1] - xyz[i3 + 1], dz = xyz[j3 + 2] - xyz[i3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 > cutoff2 || r2 < 1e-4) continue;
        const xij = Math.sqrt(pi[X1] * pj[X1]);
        const Dij = Math.sqrt(pi[D1] * pj[D1]);
        const xij2 = xij * xij;
        const ratio2 = xij2 / r2;
        const ratio6 = ratio2 * ratio2 * ratio2;
        const dEdr2 = 6.0 * Dij * (ratio6 - ratio6 * ratio6) / r2;
        const fx = 2.0 * dEdr2 * dx;
        const fy = 2.0 * dEdr2 * dy;
        const fz = 2.0 * dEdr2 * dz;
        grad[i3] -= fx; grad[i3 + 1] -= fy; grad[i3 + 2] -= fz;
        grad[j3] += fx; grad[j3 + 1] += fy; grad[j3 + 2] += fz;
      }
    }
  }

  function createUFFSystem(elements, coords, bonds, options = {}) {
    const nAtoms = elements.length;
    const bondOrders = options.bondOrders || bonds.map(() => 1.0);
    const cutoff = options.cutoff || 10.0;
    const xyz = coords instanceof Float64Array ? coords.slice() : new Float64Array(coords);

    const adj = Array.from({ length: nAtoms }, () => []);
    for (const [a, b] of bonds) {
      adj[a].push(b);
      adj[b].push(a);
    }

    const atomTypes = elements.map((el, i) => assignAtomType(el, adj[i].length));
    const topo = buildTopology(nAtoms, bonds);

    const bondTerms = bonds.map(([i, j], idx) => {
      const pi = getParams(atomTypes[i]);
      const pj = getParams(atomTypes[j]);
      const bo = bondOrders[idx];
      const r0 = naturalBondLength(pi, pj, bo);
      const k = bondForceConstant(pi, pj, r0);
      return { i, j, r0, k, bondOrder: bo };
    });

    const angleTerms = topo.angles.map(([i, j, k]) => {
      const pj = getParams(atomTypes[j]);
      const theta0 = pj[THETA0] * DEG2RAD;
      const pi = getParams(atomTypes[i]);
      const pk = getParams(atomTypes[k]);
      const rij = naturalBondLength(pi, pj, 1.0);
      const rjk = naturalBondLength(pj, pk, 1.0);
      const K = angleForceConstant(pi, pj, pk, rij, rjk, theta0);
      const cosT0 = Math.cos(theta0);
      const sinT0Sq = 1.0 - cosT0 * cosT0;
      let C0;
      let C1;
      let C2;
      if (sinT0Sq < 1e-8) {
        C0 = 1.0; C1 = 1.0; C2 = 0.0;
      } else {
        C2 = 1.0 / (4.0 * sinT0Sq);
        C1 = -4.0 * C2 * cosT0;
        C0 = C2 * (2.0 * cosT0 * cosT0 + 1.0);
      }
      return { i, j, k, K, C0, C1, C2, theta0 };
    });

    const torsionTerms = [];
    for (const [i, j, k, l] of topo.dihedrals) {
      const pj = getParams(atomTypes[j]);
      const pk = getParams(atomTypes[k]);
      let bo = 1.0;
      for (let bi = 0; bi < bonds.length; bi += 1) {
        const [a, b] = bonds[bi];
        if ((a === j && b === k) || (a === k && b === j)) {
          bo = bondOrders[bi];
          break;
        }
      }
      const torsion = torsionBarrier(pj, pk, bo);
      if (torsion.V < 1e-10) continue;
      const phi0 = torsion.n === 6 ? 0.0 : Math.PI;
      const cosPhi0 = Math.cos(torsion.n * phi0);
      torsionTerms.push({ i, j, k, l, V: torsion.V, n: torsion.n, cosPhi0 });
    }

    const inversionTerms = [];
    const sp2Types = new Set(['C_2', 'C_R', 'N_2', 'N_R', 'O_R', 'S_R']);
    for (let j = 0; j < nAtoms; j += 1) {
      const nbrs = adj[j];
      if (!Array.isArray(nbrs) || nbrs.length !== 3) continue;
      const atype = atomTypes[j];
      if (!atype || !sp2Types.has(atype)) continue;

      const el = elements[j];
      let K = 0.0;
      const C0 = 1.0;
      const C1 = -1.0;
      const C2 = 0.0;
      if (el === 'C') {
        let isBoundToO = false;
        for (const nb of nbrs) {
          if (elements[nb] !== 'O' || !(Array.isArray(adj[nb]) && adj[nb].length <= 2)) continue;
          if (adj[nb].length === 1) {
            isBoundToO = true;
            break;
          }
          for (let bi = 0; bi < bonds.length; bi += 1) {
            const [a, b] = bonds[bi];
            if (((a === j && b === nb) || (a === nb && b === j)) && bondOrders[bi] >= 1.5) {
              isBoundToO = true;
              break;
            }
          }
          if (isBoundToO) break;
        }
        K = isBoundToO ? 50.0 : 6.0;
      }
      if (K < 1e-10) continue;

      const [n0, n1, n2] = nbrs;
      const K3 = K / 3.0;
      inversionTerms.push({ i: n0, j, k: n1, l: n2, K: K3, C0, C1, C2 });
      inversionTerms.push({ i: n0, j, k: n2, l: n1, K: K3, C0, C1, C2 });
      inversionTerms.push({ i: n1, j, k: n2, l: n0, K: K3, C0, C1, C2 });
    }

    const bondTermsByAtom = Array.from({ length: nAtoms }, () => []);
    for (let termIndex = 0; termIndex < bondTerms.length; termIndex += 1) {
      const term = bondTerms[termIndex];
      bondTermsByAtom[term.i].push(termIndex);
      bondTermsByAtom[term.j].push(termIndex);
    }
    const angleTermsByAtom = Array.from({ length: nAtoms }, () => []);
    for (let termIndex = 0; termIndex < angleTerms.length; termIndex += 1) {
      const term = angleTerms[termIndex];
      angleTermsByAtom[term.i].push(termIndex);
      angleTermsByAtom[term.j].push(termIndex);
      angleTermsByAtom[term.k].push(termIndex);
    }
    const torsionTermsByAtom = Array.from({ length: nAtoms }, () => []);
    for (let termIndex = 0; termIndex < torsionTerms.length; termIndex += 1) {
      const term = torsionTerms[termIndex];
      torsionTermsByAtom[term.i].push(termIndex);
      torsionTermsByAtom[term.j].push(termIndex);
      torsionTermsByAtom[term.k].push(termIndex);
      torsionTermsByAtom[term.l].push(termIndex);
    }
    const inversionTermsByAtom = Array.from({ length: nAtoms }, () => []);
    for (let termIndex = 0; termIndex < inversionTerms.length; termIndex += 1) {
      const term = inversionTerms[termIndex];
      inversionTermsByAtom[term.i].push(termIndex);
      inversionTermsByAtom[term.j].push(termIndex);
      inversionTermsByAtom[term.k].push(termIndex);
      inversionTermsByAtom[term.l].push(termIndex);
    }

    return {
      nAtoms,
      elements,
      atomTypes,
      xyz,
      bonds,
      bondOrders,
      bondTerms,
      angleTerms,
      torsionTerms,
      inversionTerms,
      bondTermsByAtom,
      angleTermsByAtom,
      torsionTermsByAtom,
      inversionTermsByAtom,
      exclusions: topo.exclusions,
      cutoff,
      adj,
    };
  }

  function totalEnergy(sys) {
    return bondEnergy(sys.xyz, sys)
      + angleEnergy(sys.xyz, sys)
      + torsionEnergy(sys.xyz, sys)
      + inversionEnergy(sys.xyz, sys)
      + vdwEnergy(sys.xyz, sys);
  }

  function totalGradient(sys) {
    const grad = new Float64Array(3 * sys.nAtoms);
    bondGradient(sys.xyz, grad, sys);
    angleGradient(sys.xyz, grad, sys);
    torsionGradient(sys.xyz, grad, sys);
    inversionGradient(sys.xyz, grad, sys);
    vdwGradient(sys.xyz, grad, sys);
    return grad;
  }

  function normalizeAtomIndexList(indices, nAtoms) {
    const unique = new Set();
    for (const raw of Array.isArray(indices) ? indices : []) {
      const idx = raw | 0;
      if (idx >= 0 && idx < nAtoms) unique.add(idx);
    }
    return Array.from(unique).sort((a, b) => a - b);
  }

  function expandBondNeighborhood(adj, seedIndices, maxHops) {
    const hops = Math.max(0, maxHops | 0);
    const visited = new Set(seedIndices);
    let frontier = seedIndices.slice();
    for (let hop = 0; hop < hops; hop += 1) {
      const next = [];
      for (const atomIndex of frontier) {
        const neighbors = Array.isArray(adj[atomIndex]) ? adj[atomIndex] : [];
        for (const neighbor of neighbors) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
      if (!next.length) break;
      frontier = next;
    }
    return Array.from(visited).sort((a, b) => a - b);
  }

  function createLocalOptimizationContext(sys, seedAtomIndices, options = {}) {
    const movableAtomIndices = normalizeAtomIndexList(seedAtomIndices, sys.nAtoms);
    const bondedNeighborhoodHops = Number.isInteger(options.bondedNeighborhoodHops)
      ? Math.max(0, options.bondedNeighborhoodHops | 0)
      : 2;
    const shellAtomIndices = normalizeAtomIndexList(options.shellAtomIndices, sys.nAtoms);
    const contextAtomIndices = shellAtomIndices.length
      ? Array.from(new Set([...movableAtomIndices, ...shellAtomIndices])).sort((a, b) => a - b)
      : expandBondNeighborhood(sys.adj, movableAtomIndices, bondedNeighborhoodHops);
    const movableSet = new Set(movableAtomIndices);
    const contextSet = new Set(contextAtomIndices);

    const bondTermIndices = new Set();
    const angleTermIndices = new Set();
    const torsionTermIndices = new Set();
    const inversionTermIndices = new Set();

    for (const atomIndex of contextAtomIndices) {
      const bondIndices = Array.isArray(sys.bondTermsByAtom && sys.bondTermsByAtom[atomIndex]) ? sys.bondTermsByAtom[atomIndex] : [];
      const angleIndices = Array.isArray(sys.angleTermsByAtom && sys.angleTermsByAtom[atomIndex]) ? sys.angleTermsByAtom[atomIndex] : [];
      const torsionIndices = Array.isArray(sys.torsionTermsByAtom && sys.torsionTermsByAtom[atomIndex]) ? sys.torsionTermsByAtom[atomIndex] : [];
      const inversionIndices = Array.isArray(sys.inversionTermsByAtom && sys.inversionTermsByAtom[atomIndex]) ? sys.inversionTermsByAtom[atomIndex] : [];
      for (const termIndex of bondIndices) bondTermIndices.add(termIndex);
      for (const termIndex of angleIndices) angleTermIndices.add(termIndex);
      for (const termIndex of torsionIndices) torsionTermIndices.add(termIndex);
      for (const termIndex of inversionIndices) inversionTermIndices.add(termIndex);
    }

    const nonbondedPairs = [];
    const seenPairKeys = new Set();
    for (const i of movableAtomIndices) {
      for (const j of contextAtomIndices) {
        if (j <= i) continue;
        const key = `${i}-${j}`;
        if (seenPairKeys.has(key)) continue;
        seenPairKeys.add(key);
        if (sys.exclusions.has(key)) continue;
        nonbondedPairs.push([i, j]);
      }
    }

    return {
      movableAtomIndices,
      contextAtomIndices,
      movableSet,
      contextSet,
      bondTerms: Array.from(bondTermIndices).sort((a, b) => a - b).map((index) => sys.bondTerms[index]),
      angleTerms: Array.from(angleTermIndices).sort((a, b) => a - b).map((index) => sys.angleTerms[index]),
      torsionTerms: Array.from(torsionTermIndices).sort((a, b) => a - b).map((index) => sys.torsionTerms[index]),
      inversionTerms: Array.from(inversionTermIndices).sort((a, b) => a - b).map((index) => sys.inversionTerms[index]),
      nonbondedPairs,
    };
  }

  function localEnergy(sys, context) {
    const localSys = {
      nAtoms: sys.nAtoms,
      atomTypes: sys.atomTypes,
      xyz: sys.xyz,
      cutoff: sys.cutoff,
      bondTerms: Array.isArray(context && context.bondTerms) ? context.bondTerms : [],
      angleTerms: Array.isArray(context && context.angleTerms) ? context.angleTerms : [],
      torsionTerms: Array.isArray(context && context.torsionTerms) ? context.torsionTerms : [],
      inversionTerms: Array.isArray(context && context.inversionTerms) ? context.inversionTerms : [],
      nonbondedPairs: Array.isArray(context && context.nonbondedPairs) ? context.nonbondedPairs : [],
    };
    return bondEnergy(localSys.xyz, localSys)
      + angleEnergy(localSys.xyz, localSys)
      + torsionEnergy(localSys.xyz, localSys)
      + inversionEnergy(localSys.xyz, localSys)
      + vdwEnergy(localSys.xyz, localSys);
  }

  function localGradient(sys, context, options = {}) {
    const localSys = {
      nAtoms: sys.nAtoms,
      atomTypes: sys.atomTypes,
      xyz: sys.xyz,
      cutoff: sys.cutoff,
      bondTerms: Array.isArray(context && context.bondTerms) ? context.bondTerms : [],
      angleTerms: Array.isArray(context && context.angleTerms) ? context.angleTerms : [],
      torsionTerms: Array.isArray(context && context.torsionTerms) ? context.torsionTerms : [],
      inversionTerms: Array.isArray(context && context.inversionTerms) ? context.inversionTerms : [],
      nonbondedPairs: Array.isArray(context && context.nonbondedPairs) ? context.nonbondedPairs : [],
    };
    const grad = new Float64Array(3 * sys.nAtoms);
    bondGradient(localSys.xyz, grad, localSys);
    angleGradient(localSys.xyz, grad, localSys);
    torsionGradient(localSys.xyz, grad, localSys);
    inversionGradient(localSys.xyz, grad, localSys);
    vdwGradient(localSys.xyz, grad, localSys);
    if (options && options.onlyMovable && context && context.movableSet) {
      for (let atomIndex = 0; atomIndex < sys.nAtoms; atomIndex += 1) {
        if (context.movableSet.has(atomIndex)) continue;
        const base = 3 * atomIndex;
        grad[base] = 0;
        grad[base + 1] = 0;
        grad[base + 2] = 0;
      }
    }
    return grad;
  }

  function energyComponents(sys) {
    return {
      bond: bondEnergy(sys.xyz, sys),
      angle: angleEnergy(sys.xyz, sys),
      torsion: torsionEnergy(sys.xyz, sys),
      inversion: inversionEnergy(sys.xyz, sys),
      vdw: vdwEnergy(sys.xyz, sys),
    };
  }

  function rms(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i += 1) s += arr[i] * arr[i];
    return Math.sqrt(s / arr.length);
  }

  function minimize(sys, opts = {}) {
    const maxIter = opts.maxIter || 1000;
    const tol = opts.tol || 1e-5;
    const dtMax = opts.dtMax || 0.2;
    const callback = typeof opts.callback === 'function' ? opts.callback : null;

    const N3 = 3 * sys.nAtoms;
    const v = new Float64Array(N3);
    let dt = opts.dt0 || 0.02;
    let alpha = 0.1;
    const alpha0 = 0.1;
    const fAlpha = 0.99;
    const fInc = 1.1;
    const fDec = 0.5;
    const Nmin = 5;
    let nPos = 0;

    let E = totalEnergy(sys);
    let grad = totalGradient(sys);
    let gRMS = rms(grad);

    for (let iter = 0; iter < maxIter; iter += 1) {
      if (callback) callback(iter, E, gRMS);
      if (gRMS < tol) return { converged: true, iterations: iter, energy: E, gRMS };

      let P = 0;
      let gNorm = 0;
      let vNorm = 0;
      for (let i = 0; i < N3; i += 1) {
        P -= grad[i] * v[i];
        gNorm += grad[i] * grad[i];
        vNorm += v[i] * v[i];
      }
      gNorm = Math.sqrt(gNorm);
      vNorm = Math.sqrt(vNorm);

      if (gNorm > 1e-30) {
        for (let i = 0; i < N3; i += 1) {
          v[i] = (1.0 - alpha) * v[i] + alpha * vNorm * (-grad[i] / gNorm);
        }
      }

      if (P > 0) {
        nPos += 1;
        if (nPos > Nmin) {
          dt = Math.min(dt * fInc, dtMax);
          alpha *= fAlpha;
        }
      } else {
        nPos = 0;
        dt *= fDec;
        alpha = alpha0;
        v.fill(0);
      }

      for (let i = 0; i < N3; i += 1) {
        v[i] -= dt * grad[i];
        sys.xyz[i] += dt * v[i];
      }

      let maxDisp = 0;
      for (let i = 0; i < N3; i += 1) maxDisp = Math.max(maxDisp, Math.abs(dt * v[i]));
      if (maxDisp > 0.5) {
        const scale = 0.5 / maxDisp;
        for (let i = 0; i < N3; i += 1) {
          sys.xyz[i] -= dt * v[i] * (1.0 - scale);
          v[i] *= scale;
        }
      }

      E = totalEnergy(sys);
      grad = totalGradient(sys);
      gRMS = rms(grad);
    }

    return { converged: false, iterations: maxIter, energy: E, gRMS };
  }

  function minimizeSteepestDescent(sys, opts = {}) {
    const maxIter = opts.maxIter || 2000;
    const tol = opts.tol || 1e-5;
    let dt = opts.dt || 0.005;
    const callback = typeof opts.callback === 'function' ? opts.callback : null;

    const N3 = 3 * sys.nAtoms;
    let E = totalEnergy(sys);
    let grad = totalGradient(sys);
    let gRMS = rms(grad);

    for (let iter = 0; iter < maxIter; iter += 1) {
      if (callback) callback(iter, E, gRMS);
      if (gRMS < tol) return { converged: true, iterations: iter, energy: E, gRMS };
      const xyzOld = sys.xyz.slice();
      for (let i = 0; i < N3; i += 1) sys.xyz[i] -= dt * grad[i];
      const Enew = totalEnergy(sys);
      if (Enew < E) {
        dt *= 1.2;
        E = Enew;
        grad = totalGradient(sys);
        gRMS = rms(grad);
      } else {
        sys.xyz.set(xyzOld);
        dt *= 0.5;
      }
    }

    return { converged: false, iterations: maxIter, energy: E, gRMS };
  }

  function minimizeStep(sys, dt = 0.002) {
    const N3 = 3 * sys.nAtoms;
    const grad = totalGradient(sys);
    const maxG = 50.0;
    for (let i = 0; i < N3; i += 1) {
      if (grad[i] > maxG) grad[i] = maxG;
      if (grad[i] < -maxG) grad[i] = -maxG;
    }
    for (let i = 0; i < N3; i += 1) sys.xyz[i] -= dt * grad[i];
    return totalEnergy(sys);
  }

  global.VibeMolUFF = Object.freeze({
    UFF_PARAMS,
    assignAtomType,
    getParams,
    guessBondOrder,
    createUFFSystem,
    createLocalOptimizationContext,
    totalEnergy,
    totalGradient,
    localEnergy,
    localGradient,
    energyComponents,
    minimize,
    minimizeSteepestDescent,
    minimizeStep,
  });
})(window);
