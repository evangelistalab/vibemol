(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let preview, pending;
  const enabled = value => { $('candidate').disabled = !value; $('subject').disabled = !value; };
  const preset = settings => preview.VibeMolPreset.import(preview.JSON.parse(JSON.stringify({kind:'vibemol.preset',presetVersion:1,settings})));
  async function openPreview() {
    enabled(false);
    $('liveStatus').textContent = 'Loading methane in VibeMol…';
    const response = await fetch('basic-materials/recipes.json');
    if (!response.ok) throw new Error('Could not load the comparison materials.');
    const recipes = await response.json();
    const source = await fetch('../../../' + recipes.source);
    if (!source.ok) throw new Error('Could not load the methane orbital.');
    const text = await source.text();
    const frame = document.createElement('iframe');
    frame.title = 'VibeMol live Basic material comparison';
    frame.src = '../../../?appearanceStudy=1';
    $('liveHost').replaceChildren(frame);
    const deadline = Date.now() + 30000;
    await new Promise((resolve, reject) => {
      const check = () => {
        if (frame.contentWindow?.VibeMolAppearanceLooks) return resolve();
        if (Date.now() > deadline) return reject(new Error('VibeMol did not start. Reopen this preview to retry.'));
        setTimeout(check, 50);
      };
      check();
    });
    preview = frame.contentWindow;
    preview.document.getElementById('toolbarCollapseBtn').click();
    const loaded = await preview.VibeMolEmbed.loadFiles([{name:'canonical_4.cube',text}], {clearFirst:true});
    if (!loaded.ok) throw new Error(loaded.error || 'Could not load methane.');
    preview.VibeMolAppearanceLooks.apply('basic',{includeColors:true});
    preset({'global.showAxes':false,'global.showBox':false,'surface.autoIsoEnabled':false,
      'surface.iso':recipes.iso,'surface.opacity':1,'view.autoRotate':false,'view.projection':'perspective'});
    const camera = preview.VibeMolTesting.getCameraSnapshot(), view = {};
    for (const axis of ['x','y','z']) view['view.camera.'+axis] = camera.target[axis] + (camera.camera[axis] - camera.target[axis]) * 0.57;
    preset(view);
    function apply() {
      const recipe = recipes.options.find(item => item.id === $('candidate').value);
      preview.VibeMolAppearanceLooks.edit('material', preview.JSON.parse(JSON.stringify(recipe.material)), {
        replace:true, restoreSurfaceMaterial:preview.JSON.parse(JSON.stringify(recipe.surfaceMaterial)),
      });
      preset({'surface.enabled':$('subject').value === 'orbital'});
      $('liveStatus').textContent = recipe.name + ' · Drag to rotate; scroll to zoom. Lighting and geometry stay fixed.';
    }
    $('candidate').onchange = apply;
    $('subject').onchange = apply;
    apply(); enabled(true);
  }
  $('liveStudy').addEventListener('toggle', () => {
    if (!$('liveStudy').open || pending) return;
    pending = openPreview().catch(error => {
      $('liveStatus').textContent = error.message;
      $('liveHost').replaceChildren(); pending = null;
    });
  });
})();
