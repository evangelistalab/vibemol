(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const frames = [$('left'), $('right')];
  const ready = frame => new Promise(resolve => {
    const poll = () => frame.contentWindow.VibeMolAppearanceLooks ? resolve(frame.contentWindow) : setTimeout(poll, 50);
    poll();
  });
  const windows = await Promise.all(frames.map(ready));
  for (const win of windows) win.document.getElementById('toolbarCollapseBtn').click();
  for (const [label, experimental] of [['Presets', false], ['Experimental candidates', true]]) {
    const group = document.createElement('optgroup'); group.label = label;
    for (const item of windows[0].VibeMolAppearanceLooks.list().filter(item => item.experimental === experimental)) group.append(new Option(item.name, item.id));
    $('candidate').append(group);
  }
  $('candidate').value = 'classic';
  function orbital() {
    const n = 41, step = 0.4, values = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const x = i * step - 8, y = j * step - 8, z = k * step - 8;
      values.push((z * Math.exp(-Math.hypot(x, y, z) / 2) / (4 * Math.sqrt(2 * Math.PI))).toExponential(7));
    }
    return { name: 'hydrogen-2p.cube', text: ['Hydrogen 2p', 'Analytic comparison sample; bohr', '1 -8 -8 -8', ...['0.4 0 0','0 0.4 0','0 0 0.4'].map(axis => `41 ${axis}`), '1 0 0 0 0', values.join(' ')].join('\n') };
  }
  async function sample() {
    if ($('sample').value === 'orbital') return orbital();
    if ($('sample').value === 'methane') return {name:'methane.xyz',text:'5\nMethane\nC 0 0 0\nH 0.63 0.63 0.63\nH -0.63 -0.63 0.63\nH -0.63 0.63 -0.63\nH 0.63 -0.63 -0.63\n'};
    if ($('sample').value === 'metal') return {name:'coordination.xyz',text:'7\nOctahedral iron coordination display\nFe 0 0 0\nN 2 0 0\nN -2 0 0\nN 0 2 0\nN 0 -2 0\nN 0 0 2\nN 0 0 -2\n'};
    const response = await fetch('../../../assets/fragments/pyridine.xyz');
    if (!response.ok) throw new Error('Could not load the sample.');
    return {name:'pyridine.xyz',text:await response.text()};
  }
  function apply() {
    windows[0].VibeMolAppearanceLooks.apply($('reference').value);
    windows[1].VibeMolAppearanceLooks.apply($('mode').value === 'materials' ? $('reference').value : $('candidate').value);
    if ($('mode').value === 'materials') {
      const recipe = windows[1].VibeMolLooks.builtins.find(item => item.id === $('candidate').value).settings['appearance.rendering'];
      windows[1].VibeMolAppearanceLooks.edit('material', recipe.material, {replace:true});
    }
    $('leftLabel').textContent = $('reference').selectedOptions[0].textContent;
    $('rightLabel').textContent = $('candidate').selectedOptions[0].textContent + ($('mode').value === 'materials' ? ' · materials only' : '');
    $('status').textContent = $('mode').value === 'materials' ? 'Geometry, palette, lighting, and background match the reference.' : 'Each preset applies its complete geometry, materials, colors, and lighting.';
  }
  async function load() {
    for (const el of document.querySelectorAll('select')) el.disabled = true;
    $('status').textContent = 'Loading sample…';
    try {
      const file = await sample();
      await Promise.all(windows.map(async win => {
        const result = await win.VibeMolEmbed.loadFiles([file], {clearFirst:true});
        if (!result.ok) throw new Error(result.error);
        win.VibeMolPreset.import(win.JSON.parse(JSON.stringify({kind:'vibemol.preset',presetVersion:1,settings:{'global.showAxes':false,'global.showBox':false,'surface.iso':0.018,'surface.autoIsoEnabled':false}})));
        if (!win.document.body.classList.contains('sidebar-collapsed')) win.document.getElementById('toolbarCollapseBtn').click();
      }));
      apply();
    } catch (error) { $('status').textContent = error.message; }
    finally { for (const el of document.querySelectorAll('select')) el.disabled = false; }
  }
  for (const id of ['reference','candidate','mode']) $(id).onchange = apply;
  $('sample').onchange = load;
  for (const [index, id] of ['editLeft','editRight'].entries()) $(id).onclick = () => {
    const win = windows[index];
    win.document.getElementById(win.document.body.classList.contains('sidebar-collapsed') ? 'toolbarShowBtn' : 'toolbarCollapseBtn').click();
    if (win.document.getElementById('displayInspectorBtn').getAttribute('aria-expanded') !== 'true') win.document.getElementById('displayInspectorBtn').click();
    win.VibeMolAppearanceLooks.openStudio();
  };
  await load();
})();
