/* Worker messages contain grid data only; source buffers are never transferred. */
importScripts('./arithmetic-grid.js');
self.onmessage = (event) => {
  const { operation, operands, outputName, limits } = event.data;
  try {
    for (const { vol } of operands) {
      const [, ny, nz] = vol.nxyz;
      vol.idx = (i, j, k) => (i * ny + j) * nz + k;
    }
    const result = self.VibeMolArithmeticGrid.compute(operation, operands, outputName, limits);
    if (result.ok) {
      const { origin, axes, nxyz } = result.baseVol;
      result.baseVol = { origin, axes, nxyz };
    }
    self.postMessage(result, result.ok ? [result.data.buffer] : []);
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || String(error) });
  }
};
