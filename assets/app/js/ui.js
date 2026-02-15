(function (global) {
  function symbolForZ(z, atomData) {
    return (atomData && atomData[z] && atomData[z].symbol) || String(z);
  }

  function atomCoordsAng(vol, atom, bohrToAng) {
    if (vol.units === 'angstrom') return [atom.x, atom.y, atom.z];
    return [atom.x * bohrToAng, atom.y * bohrToAng, atom.z * bohrToAng];
  }

  function renderCoordsContent(record, bohrToAng, atomData) {
    if (!record) return '<em>No file loaded</em>';

    const v = record.vol;
    if (!v || !Array.isArray(v.atoms) || v.atoms.length === 0) {
      return '<em>No atoms</em>';
    }

    const rows = v.atoms.map((a, i) => {
      const z = a.Z | 0;
      const sym = symbolForZ(z, atomData);
      const [x, y, zA] = atomCoordsAng(v, a, bohrToAng);
      return `<tr><td>${i + 1}</td><td>${sym}</td><td>${z}</td><td>${x.toFixed(3)}</td><td>${y.toFixed(3)}</td><td>${zA.toFixed(3)}</td></tr>`;
    }).join('');

    return `
      <div style="margin-bottom:8px;color:var(--muted)">Active: ${record.name}</div>
      <table>
        <thead><tr><th>#</th><th>Sym</th><th>Z</th><th>x</th><th>y</th><th>z</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function volumeToXYZ(record, bohrToAng, atomData) {
    if (!record) return '';

    const v = record.vol;
    if (!v || !Array.isArray(v.atoms)) return '';

    const lines = [];
    lines.push(String(v.atoms.length));
    lines.push((v.title || record.name || '').toString());

    for (const a of v.atoms) {
      const z = a.Z | 0;
      const sym = symbolForZ(z, atomData);
      const [x, y, zA] = atomCoordsAng(v, a, bohrToAng);
      lines.push(`${sym} ${x.toFixed(6)} ${y.toFixed(6)} ${zA.toFixed(6)}`);
    }

    return lines.join('\n');
  }

  global.VibeMolUI = {
    renderCoordsContent,
    volumeToXYZ,
  };
})(window);
