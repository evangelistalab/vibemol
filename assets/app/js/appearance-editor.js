(function (global) {
  'use strict';
  const M = global.VibeMolAppearanceModel;
  function createController(deps) {
    const root = deps.root, controls = [], $ = id => root.querySelector('#' + id);
    let activeMaterialId = null;
    root.innerHTML = `
      <details class="vm-appearance-section" id="appearanceGeometrySection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Geometry</span></summary><div id="geometryFields"></div></details>
      <details class="vm-appearance-section" id="appearanceMaterialsSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Material</span></summary>
        <p class="vm-session-status">One material for atoms, bonds, and surfaces.</p><div id="materialFields"></div>
        <div id="materialAdvancedFields"></div>
        <details><summary class="inspectorSubsectionSummary">Save material</summary><div id="materialLibraryFields"></div></details>
        <div class="vm-session-status" id="materialStatus" role="status"></div>
      </details>
      <details class="vm-appearance-section" id="appearanceLightingSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Lighting & contours</span></summary><div id="lightingFields"></div>
        <details><summary class="inspectorSubsectionSummary">Light colors</summary><div id="lightColorFields"></div></details>
      </details>`;
    function row(parent, id, label, content) {
      const el = document.createElement('div'); el.className = 'vm-field-row'; el.id = id + 'Row';
      el.innerHTML = `<label class="vm-field-label" for="${id}">${label}</label><div class="vm-field-control">${content}</div>`;
      $(parent).append(el); return el;
    }
    const edit = (section, patch, phase = 'change', options = {}) => deps.edit(section, patch, options, phase);
    function select(parent, id, label, choices, getter, setter, visible = () => true) {
      const el = row(parent, id, label, `<select id="${id}" class="vm-select" aria-label="${label}"></select>`);
      for (const [value, name] of choices) $(id).add(new Option(name, value));
      $(id).onchange = () => setter($(id).value);
      controls.push(state => { el.hidden = !visible(state); $(id).value = getter(state); });
      return $(id);
    }
    function toggle(parent, id, label, getter, setter, visible = () => true) {
      const el = row(parent, id, label, `<label class="vm-toggle"><input id="${id}" class="vm-toggle__input" type="checkbox" role="switch" aria-label="${label}"><span class="vm-toggle__thumb" aria-hidden="true"></span></label>`);
      $(id).onchange = () => setter($(id).checked);
      controls.push(state => { el.hidden = !visible(state); $(id).checked = getter(state); });
    }
    function slider(parent, id, label, min, max, precision, getter, setter, options = {}) {
      const el = row(parent, id, label, `<div class="vm-slider" data-min="${min}" data-max="${max}" data-precision="${precision}">
        <input id="${id}Range" class="vm-slider__range" type="range" aria-label="${label}"><input id="${id}" class="vm-slider__value vm-mono" type="text" inputmode="decimal" aria-label="${label} value" value="${min}"></div>`);
      el.lastElementChild.classList.add('vm-field-control--slider');
      const component = deps.createSlider(el.querySelector('.vm-slider'));
      for (const type of ['input', 'change']) $(id).addEventListener(type, event => {
        if (type === 'input' && document.activeElement === $(id)) return;
        const value = Number($(id).value); if (Number.isFinite(value)) setter(Math.max(min, Math.min(max, value)), type);
      });
      controls.push(state => {
        el.hidden = options.visible ? !options.visible(state) : false;
        component.setDisabled(options.disabled ? options.disabled(state) : false);
        if (document.activeElement !== $(id)) component.setValue(getter(state));
        const mixed = options.mixed && options.mixed(state);
        $(id).placeholder = mixed ? 'Mixed' : '';
        if (mixed && document.activeElement !== $(id)) $(id).value = '';
      });
    }
    function color(parent, id, label, getter, setter, visible = () => true) {
      const el = row(parent, id, label, `<span class="vm-color-swatch"><input id="${id}" class="vm-color-swatch__input" type="color" aria-label="${label}"><span class="vm-color-swatch__preview" aria-hidden="true"></span></span>`);
      $(id).oninput = () => setter($(id).value, 'input'); $(id).onchange = () => setter($(id).value, 'change');
      controls.push(state => { el.hidden = !visible(state); $(id).value = getter(state); $(id).nextElementSibling.style.backgroundColor = getter(state); });
    }
    select('geometryFields', 'appearanceConnector', 'Bonds', [['cylinder','Cylinders'],['kit','Kit connectors']], s => s.rendering.geometry.connector,
      value => edit('geometry', { connector: value, curvedMultipleBonds: value === 'kit' }));
    slider('geometryFields', 'appearanceAtomSize', 'Atom scale', 0.4, 2, 2, s => s.rendering.geometry.atomScaleMain * s.settings['molecule.atomRadiusScale'],
      (value, phase) => edit('geometry', { atomScaleMain: value, atomScaleTransitionMetal: value }, phase));
    slider('geometryFields', 'appearanceBondRadius', 'Bond radius', 0.02, 0.22, 3, s => s.rendering.geometry.bondRadius * s.settings['molecule.bondRadiusScale'],
      (value, phase) => edit('geometry', { bondRadius: value }, phase));
    slider('geometryFields', 'appearanceCollarRadius', 'Joint radius', 0.03, 0.3, 3, s => s.rendering.geometry.kitCollarRadius,
      (value, phase) => edit('geometry', { kitCollarRadius: value }, phase), { visible: s => s.rendering.geometry.connector === 'kit' });
    toggle('geometryFields', 'appearanceCurvedBonds', 'Curved bonds', s => s.rendering.geometry.curvedMultipleBonds,
      value => edit('geometry', { curvedMultipleBonds: value }), s => s.rendering.geometry.connector === 'kit');

    const swatches = [
      ['custom','Custom'], ['emissive','Emissive'], ['satin','Satin'], ['lacquer','Lacquer'],
      ['metal','Metal'], ['gel','Gel'], ['ceramic','Ceramic'], ['polished','Polished'],
      ['matte','Matte'], ['enamel','Enamel'], ['smooth','Classic smooth'], ['toon','Toon'],
    ];
    const swatchSelect = select('materialFields', 'appearanceMaterialPreset', 'Material', swatches, s => s.swatch,
      value => { if (value === 'custom') return; const saved = deps.getMaterials().find(item => item.id === value);
        activeMaterialId = saved?.id || null;
        if (saved) $('materialName').value = saved.name;
        const mat = saved ? saved.material : preset(value); edit('material', mat, 'change', { replace: true }); });
    const visibleFor = model => s => s.material.model === model;
    for (const [id, label, key, min, max, precision, parent, visible] of [
      ['Roughness','Roughness','roughness',0,1,3,'materialFields',visibleFor('physical')],
      ['Shininess','Shininess','shininess',0,250,0,'materialFields',visibleFor('phong')],
      ['Highlight','Highlight','specularIntensity',0,2,2,'materialFields',visibleFor('physical')],
      ['Metalness','Metalness','metalness',0,1,2,'materialAdvancedFields',visibleFor('physical')],
      ['Clearcoat','Clearcoat','clearcoat',0,1,2,'materialAdvancedFields',visibleFor('physical')],
      ['CoatRoughness','Coat roughness','clearcoatRoughness',0,1,3,'materialAdvancedFields',visibleFor('physical')],
      ['Environment','Reflections','envMapIntensity',0,2,2,'materialAdvancedFields',visibleFor('physical')],
      ['Reflectivity','Reflectivity','reflectivity',0,1,2,'materialAdvancedFields',visibleFor('physical')],
      ['Emission','Color fill','emissiveIntensity',0,2,2,'materialAdvancedFields',() => true],
      ['Iridescence','Pearlescence','iridescence',0,1,2,'materialAdvancedFields',visibleFor('physical')],
    ]) slider(parent, 'appearanceMaterial'+id, label, min,max,precision,s => s.material[key], (value,phase) => edit('material',{[key]:value},phase),
      { visible });
    slider('materialFields','appearanceMaterialOpacity','Opacity',0.05,1,2,s => s.opacity,(value,phase) => deps.opacity(value,phase),{mixed:s=>s.mixedOpacity});
    slider('materialFields','appearanceToonBands','Bands',2,8,0,s=>s.material.toonSteps.length,(value,phase)=>edit('material',{toonSteps:Array.from({length:Math.round(value)},(_,i)=>Math.round(255*i/(Math.round(value)-1)))},phase),{visible:visibleFor('toon')});
    color('materialAdvancedFields','appearanceSpecularColor','Highlight color',s=>s.material.specularColor,(value,phase)=>edit('material',{specularColor:value},phase),s=>s.material.model!=='toon');
    color('materialAdvancedFields','appearanceMaterialTint','Tint',s=>s.material.tint,(value,phase)=>edit('material',{tint:value},phase));
    toggle('materialAdvancedFields','appearanceEmissionUsesColor','Fill from color',s=>s.material.emissiveUsesColor,value=>edit('material',{emissiveUsesColor:value}));
    color('materialAdvancedFields','appearanceEmissionColor','Fill color',s=>s.material.emissiveColor,(value,phase)=>edit('material',{emissiveColor:value},phase),s=>!s.material.emissiveUsesColor);

    select('lightingFields','appearancePalette','Atom palette',[['basic','Standard'],['toon','Luminous'],['kit','Kit']],s=>s.rendering.coloring.palette,value=>edit('coloring',{palette:value}));
    toggle('lightingFields','appearanceElementBonds','Element bonds',s=>s.rendering.coloring.elementBonds,value=>edit('coloring',{elementBonds:value}));
    color('lightingFields','appearanceBondColor','Bond tint',s=>s.rendering.coloring.bondColor,(value,phase)=>edit('coloring',{bondColor:value},phase));
    for (const [key,label,min,max] of [['dirIntensity','Key light',0,6],['hemiIntensity','Fill light',0,3],['rimIntensity','Rim light',0,6],['ambIntensity','Ambient',0,2],['exposure','Exposure',0.4,2]]) {
      slider('lightingFields','appearanceLight'+key,label,min,max,2,s=>s.rendering.lighting[key],(value,phase)=>edit('lighting',{[key]:value},phase));
    }
    select('lightingFields','appearanceToneMapping','Tone mapping',[['linear','Linear'],['aces','Studio (ACES)'],['none','None']],s=>s.rendering.lighting.toneMapping,value=>edit('lighting',{toneMapping:value}));
    const direction = (s,key) => { const [x,y,z]=s.rendering.lighting[key]; return [Math.atan2(x,z)*180/Math.PI,Math.atan2(y,Math.hypot(x,z))*180/Math.PI]; };
    function lightAngle(key,axis,value,phase) { const rendering=deps.getRendering(), radius=Math.hypot(...rendering.lighting[key]), angles=direction({rendering},key); angles[axis]=value; const [a,b]=angles.map(v=>v*Math.PI/180); edit('lighting',{[key]:[radius*Math.sin(a)*Math.cos(b),radius*Math.sin(b),radius*Math.cos(a)*Math.cos(b)]},phase); }
    for (const [key,id,label] of [['dirPos','Light','Key'],['rimPos','Rim','Rim']]) {
      slider('lightingFields','appearance'+id+'Azimuth',label+' angle',-180,180,0,s=>direction(s,key)[0],(v,p)=>lightAngle(key,0,v,p));
      slider('lightingFields','appearance'+id+'Elevation',label+' height',-89,89,0,s=>direction(s,key)[1],(v,p)=>lightAngle(key,1,v,p));
    }
    slider('lightingFields','appearanceContours','Contours',0,0.04,3,s=>s.rendering.effects.outlineWidth || s.rendering.effects.atomOutlineFraction*0.155*s.rendering.geometry.atomScaleMain,
      (value,phase)=>edit('effects',{outlineWidth:value,atomOutlineFraction:0,bondOutlineFraction:0},phase));
    toggle('lightingFields','appearanceHighlights','Highlight shells',s=>s.rendering.effects.highlights,value=>edit('effects',{highlights:value}));
    toggle('lightingFields','appearanceFollowTheme','Follow UI theme',s=>s.rendering.lighting.followTheme,value=>edit('lighting',{followTheme:value}));
    for (const [key,label] of [['dirColor','Key color'],['hemiColor','Fill color'],['hemiGroundColor','Ground color'],['rimColor','Rim color'],['ambColor','Ambient color']]) color('lightColorFields','appearanceLight'+key,label,s=>s.rendering.lighting[key],(value,phase)=>edit('lighting',{[key]:value},phase));

    row('materialLibraryFields','materialName','Name','<input id="materialName" type="text" maxlength="60" aria-label="Material name">');
    const actions=document.createElement('div');actions.className='vm-popover__actions';actions.innerHTML='<button id="saveMaterial" class="secondary" type="button">Save as new</button><button id="exportMaterial" class="secondary" type="button">Export</button><button id="importMaterial" class="secondary" type="button">Import</button><input id="materialFile" type="file" accept=".json,application/json" hidden>';$('materialLibraryFields').append(actions);
    $('saveMaterial').onclick=()=>deps.saveMaterial($('materialName').value, currentMaterial());
    const manage=document.createElement('div');manage.className='vm-popover__actions';manage.innerHTML='<button id="updateMaterial" class="secondary" type="button" disabled>Update saved</button><button id="deleteMaterial" class="secondary" type="button" disabled>Delete saved</button>';$('materialLibraryFields').append(manage);
    $('updateMaterial').onclick=()=>deps.updateMaterial(activeMaterialId,$('materialName').value,currentMaterial());
    $('deleteMaterial').onclick=()=>{deps.deleteMaterial(activeMaterialId);activeMaterialId=null;sync();};
    $('exportMaterial').onclick=()=>deps.exportMaterial($('materialName').value || 'My material', currentMaterial());
    $('importMaterial').onclick=()=>$('materialFile').click();
    $('materialFile').onchange=async()=>{const file=$('materialFile').files[0];$('materialFile').value='';if(file)await deps.importMaterial(file);};
    function preset(id) {
      if(id==='polished')return M.legacy('basic').material;
      if(id==='smooth')return M.material({model:'phong',shininess:30,specularColor:'#777777'});
      if(id==='toon')return M.material({model:'toon'});
      return M.surfacePreset(id);
    }
    function currentMaterial() {
      return deps.getRendering().material;
    }
    function sync() {
      const rendering=deps.getRendering(), settings=deps.captureSettings(), material=currentMaterial();
      const opacityState=deps.getOpacity();
      const state={rendering,settings,material,opacity:opacityState.value,mixedOpacity:opacityState.mixed,swatch:'custom'};
      const saved=deps.getMaterials();
      for(const option of Array.from(swatchSelect.options))if(option.value.startsWith('user-'))option.remove();
      for(const item of saved)swatchSelect.add(new Option(item.name,item.id));
      const same=other=>JSON.stringify(M.validateMaterial(other))===JSON.stringify(M.validateMaterial(material));
      state.swatch=saved.find(item=>same(item.material))?.id || swatches.slice(1).find(([id])=>same(preset(id)))?.[0] || 'custom';
      const look=deps.getActiveLook();
      swatchSelect.options[0].textContent=state.swatch==='custom' && look && same(look.settings['appearance.rendering'].material)
        ? `${look.name} material` : 'Custom';
      if (!activeMaterialId && state.swatch.startsWith('user-')) activeMaterialId=state.swatch;
      const activeSaved=saved.find(item=>item.id===activeMaterialId);
      $('updateMaterial').disabled=!activeSaved;$('deleteMaterial').disabled=!activeSaved;
      for(const fn of controls)fn(state);
      $('materialStatus').textContent=opacityState.mixed?'Opacity varies in this scene. Adjust it to apply one value everywhere.':'';
    }
    return Object.freeze({sync,currentMaterial});
  }
  global.VibeMolAppearanceEditor=Object.freeze({createController});
})(window);
