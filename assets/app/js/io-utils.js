(function () {
  /**
   * Detect one high-level file kind by name/content.
   * @param {string} name
   * @param {string=} text
   * @returns {'xyz'|'cube'|'two_component_cube'|'vibration_payload'|'orca_hess'|'psi4_output'|'json'|'unknown'}
   */
  function detectInputFileKind(name, text) {
    const lower = String(name || '').trim().toLowerCase();
    const body = String(text || '');
    if (lower.endsWith('.xyz')) return 'xyz';
    if (lower.endsWith('.2ccube')) return 'two_component_cube';
    if (lower.endsWith('.cube') || lower.endsWith('.cub')) return 'cube';
    if (lower.endsWith('.hess')) return 'orca_hess';
    if (lower.endsWith('.vib.json') || lower.endsWith('.vmodes.json') || lower.endsWith('.modes.json')) return 'vibration_payload';
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.out') || lower.endsWith('.output') || lower.endsWith('.dat')) {
      if (/\b==>\s*geometry\s*<==/i.test(body) && /\bharmonic frequencies/i.test(body)) return 'psi4_output';
    }
    return 'unknown';
  }

  window.VibeMolIOUtils = Object.freeze({
    detectInputFileKind,
  });
})();
