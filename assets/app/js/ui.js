(function (global) {
  /**
   * Escape plain text for safe HTML output.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Resolve an element symbol from atomic number.
   * Falls back to the numeric `Z` string if lookup data is unavailable.
   * @param {number} z
   * @param {Record<number, {symbol?:string}>} atomData
   * @returns {string}
   */
  function symbolForZ(z, atomData) {
    return (atomData && atomData[z] && atomData[z].symbol) || String(z);
  }

  /**
   * Return atom coordinates in angstrom units regardless of source units.
   * @param {{units?:string}} vol
   * @param {{x:number,y:number,z:number}} atom
   * @param {number} bohrToAng
   * @returns {[number, number, number]}
   */
  function atomCoordsAng(vol, atom, bohrToAng) {
    if (vol.units === 'angstrom') return [atom.x, atom.y, atom.z];
    return [atom.x * bohrToAng, atom.y * bohrToAng, atom.z * bohrToAng];
  }

  /**
   * Return atom coordinates in requested display units.
   * @param {{units?:string}} vol
   * @param {{x:number,y:number,z:number}} atom
   * @param {number} bohrToAng
   * @param {'angstrom'|'bohr'} displayUnits
   * @returns {[number, number, number]}
   */
  function atomCoordsDisplay(vol, atom, bohrToAng, displayUnits) {
    const units = displayUnits === 'bohr' ? 'bohr' : 'angstrom';
    if (units === 'bohr') {
      if (vol.units === 'bohr') return [atom.x, atom.y, atom.z];
      return [atom.x / bohrToAng, atom.y / bohrToAng, atom.z / bohrToAng];
    }
    return atomCoordsAng(vol, atom, bohrToAng);
  }

  /**
   * Render the side-panel atom table as HTML.
   * @param {{name:string,vol?:{atoms?:Array<{Z:number,x:number,y:number,z:number}>,units?:string}}|null} record
   * @param {number} bohrToAng
   * @param {Record<number, {symbol?:string}>} atomData
   * @param {'angstrom'|'bohr'} [displayUnits='angstrom']
   * @returns {string}
   */
  function renderCoordsContent(record, bohrToAng, atomData, displayUnits) {
    if (!record) return '<em>No file loaded</em>';

    const v = record.vol;
    if (!v || !Array.isArray(v.atoms) || v.atoms.length === 0) {
      return '<em>No atoms</em>';
    }

    const rows = v.atoms.map((a, i) => {
      const z = a.Z | 0;
      const sym = symbolForZ(z, atomData);
      const [x, y, zA] = atomCoordsDisplay(v, a, bohrToAng, displayUnits);
      const atomIndex = String(i);
      const cell = (field, label) => `<button type="button" class="coordsCellButton" data-atom-index="${atomIndex}" data-edit-field="${field}">${escapeHtml(label)}</button>`;
      return `<tr data-atom-index="${atomIndex}">
        <td>${cell('order', String(i + 1))}</td>
        <td>${cell('sym', sym)}</td>
        <td>${cell('z', String(z))}</td>
        <td>${cell('x', x.toFixed(3))}</td>
        <td>${cell('y', y.toFixed(3))}</td>
        <td>${cell('zCoord', zA.toFixed(3))}</td>
      </tr>`;
    }).join('');

    return `
      <div class="coordsActiveLabel">Active: ${escapeHtml(record.name)}</div>
      <table class="coordsTable">
        <thead><tr><th>#</th><th>Sym</th><th>Z</th><th>x</th><th>y</th><th>z</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  /**
   * Convert the active record into XYZ text for clipboard/download export.
   * @param {{name:string,vol?:{title?:string,atoms?:Array<{Z:number,x:number,y:number,z:number}>,units?:string}}|null} record
   * @param {number} bohrToAng
   * @param {Record<number, {symbol?:string}>} atomData
   * @param {'angstrom'|'bohr'} [displayUnits='angstrom']
   * @returns {string}
   */
  function volumeToXYZ(record, bohrToAng, atomData, displayUnits) {
    if (!record) return '';

    const v = record.vol;
    if (!v || !Array.isArray(v.atoms)) return '';

    const lines = [];
    lines.push(String(v.atoms.length));
    lines.push((v.title || record.name || '').toString());

    for (const a of v.atoms) {
      const z = a.Z | 0;
      const sym = symbolForZ(z, atomData);
      const [x, y, zA] = atomCoordsDisplay(v, a, bohrToAng, displayUnits);
      lines.push(`${sym} ${x.toFixed(6)} ${y.toFixed(6)} ${zA.toFixed(6)}`);
    }

    return lines.join('\n');
  }

  global.VibeMolUI = {
    renderCoordsContent,
    volumeToXYZ,
  };
})(window);
