(function (global) {
  'use strict';
  const M = global.VibeMolAppearanceModel;
  function createController(deps) {
    const root = deps.root, controls = [];
    const hosts = [root, deps.atomFields, deps.bondFields].filter(Boolean);
    const $ = id => hosts.map(host => host.id === id ? host : host.querySelector('#' + id)).find(Boolean);
    let activeMaterialId = null;
    let radiusElement = '6';
    root.innerHTML = `
      <details class="vm-appearance-section" id="appearanceGeometrySection" open><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Geometry</span></summary><div id="geometryFields"></div>
        <p class="vm-session-status" id="bondRadiusStatus">Bond radius sets the maximum thickness. Each bond is narrowed as needed to fit both atoms, including multiple bonds and joints.</p>
        <details id="appearanceAtomRadiiSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Atom radii</span></summary><div id="atomRadiusFields"></div><p class="vm-session-status" id="atomRadiusStatus"></p></details>
        <details id="appearanceMeshSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Mesh detail</span></summary><div id="meshDetailFields"></div></details>
        <details id="appearanceScaleSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Size multipliers</span></summary><div id="appearanceScaleFields"></div></details>
      </details>
      <details class="vm-appearance-section" id="appearanceColorsSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Colors</span></summary>
        <h3 class="vm-section-label">Atoms</h3><div id="studioAtomColorFields"></div>
        <h3 class="vm-section-label">Bonds</h3><div id="studioBondColorFields"></div>
        <h3 class="vm-section-label">Orbital defaults</h3><div id="studioSurfaceColorFields"></div>
        <p class="vm-session-status">Individual orbital color overrides are preserved.</p>
        <h3 class="vm-section-label">Scene</h3><div id="studioBackgroundFields"></div>
      </details>
      <details class="vm-appearance-section" id="appearanceMaterialsSection" data-section="material"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Material</span></summary>
        <p class="vm-session-status" id="appearanceMaterialScope">One material for atoms, bonds, and surfaces.</p>
        <button id="appearanceUseSurfaceMaterial" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" hidden>Use surface finish everywhere</button><div id="materialFields"></div>
        <details id="appearanceMaterialChannels"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Material channels</span></summary><div id="materialAdvancedFields"></div></details>
        <details><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Save material</span></summary><div id="materialLibraryFields"></div></details>
      </details>
      <details class="vm-appearance-section" id="appearanceLightingSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Lighting & contours</span></summary><div id="lightingFields"></div>
        <details><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Light colors</span></summary><div id="lightColorFields"></div></details>
        <details><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Light positions</span></summary><div id="lightPositionFields"></div></details>
      </details>
      <details class="vm-appearance-section" id="appearanceSurfaceDefaultsSection"><summary class="inspectorSubsectionSummary"><span class="vm-section-label">Surfaces</span></summary>
        <p class="vm-session-status">${deps.surfaceSelectionMode ? 'Selected surface colors and opacity. Use the outliner to choose an orbital or group.' : 'Style defaults. Custom orbital colors and opacity are preserved when changing styles.'}</p>
        <div id="surfaceDefaultFields"></div>
        <p id="studioSurfaceOverridesStatus" class="vm-session-status"></p>
        <button id="studioResetSurfaceOverrides" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" data-tooltip="${deps.surfaceSelectionMode ? 'Reset the selected orbital colors and opacity to the Look defaults.' : 'Replace custom colors and opacity on every loaded orbital with these style defaults.'} Undo restores the overrides.">${deps.surfaceSelectionMode ? 'Reset selected surfaces to look' : 'Apply defaults to all orbitals'}</button>
      </details>`;
    for (const id of ['moleculeAtomRadiusScale','moleculeBondRadiusScale']) {
      const row = document.getElementById(id)?.closest('.vm-field-row');
      if (!row) continue;
      row.classList.remove('appearanceHiddenControl'); row.removeAttribute('aria-hidden');
      row.querySelector('label').textContent=id==='moleculeAtomRadiusScale'?'Atom multiplier':'Bond multiplier';
      $('appearanceScaleFields').append(row);
    }
    function row(parent, id, label, content) {
      const el = document.createElement('div'); el.className = 'vm-field-row'; el.id = id + 'Row';
      el.innerHTML = `<label class="vm-field-label" for="${id}">${label}</label><div class="vm-field-control">${content}</div>`;
      $(parent).append(el); return el;
    }
    function bindLookRow(el, id, label, getter, setter, same = (a, b) => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-8 : JSON.stringify(a) === JSON.stringify(b)) {
      if (!deps.showBindings || ['appearanceRadiusElement', 'appearanceMaterialFamily', 'appearanceMaterialPreset'].includes(id) || id.startsWith('studioSurface')) return;
      const reset = document.createElement('button');
      reset.type = 'button'; reset.className = 'vm-btn vm-btn--icon vm-property-reset';
      reset.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>';
      reset.hidden = true; el.classList.add('vm-style-property'); el.append(reset);
      reset.onclick = () => {
        const base = baseState();
        if (base) setter(getter(base), 'change');
      };
      controls.push(state => {
        const base = baseState();
        const modified = !!base && !same(getter(state), getter(base));
        el.dataset.styleState = modified ? 'modified' : 'inherited'; reset.hidden = !modified;
        const description = `Reset ${label.toLowerCase()} to ${deps.getBaseline()?.name || 'look'}`;
        reset.setAttribute('aria-label', description); reset.setAttribute('data-tooltip', description);
      });
    }
    function baseState() {
      const settings = deps.getBaseline()?.settings;
      if (!settings) return null;
      const rendering = settings['appearance.rendering'];
      return { settings, rendering, material: rendering.material, surface: settings };
    }
    for (const [id, key, label] of [['moleculeAtomRadiusScale', 'molecule.atomRadiusScale', 'atom multiplier'],
      ['moleculeBondRadiusScale', 'molecule.bondRadiusScale', 'bond multiplier']]) {
      const el = document.getElementById(id)?.closest('.vm-field-row');
      if (el) bindLookRow(el, id, label, s => s.settings[key], value => deps.editSettings({ [key]: value }));
    }
    const edit = (section, patch, phase = 'change', options = {}) => deps.edit(section, patch, options, phase);
    function select(parent, id, label, choices, getter, setter, visible = () => true) {
      const el = row(parent, id, label, `<select id="${id}" class="vm-select" aria-label="${label}"></select>`);
      for (const [value, name] of choices) $(id).add(new Option(name, value));
      $(id).onchange = () => setter($(id).value);
      bindLookRow(el, id, label, getter, setter);
      controls.push(state => { el.hidden = !visible(state); $(id).value = getter(state); });
      return $(id);
    }
    function toggle(parent, id, label, getter, setter, visible = () => true) {
      const el = row(parent, id, label, `<label class="vm-toggle"><input id="${id}" class="vm-toggle__input" type="checkbox" role="switch" aria-label="${label}"><span class="vm-toggle__thumb" aria-hidden="true"></span></label>`);
      $(id).onchange = () => setter($(id).checked);
      bindLookRow(el, id, label, getter, setter);
      controls.push(state => { el.hidden = !visible(state); $(id).checked = getter(state); });
    }
    function slider(parent, id, label, min, max, precision, getter, setter, options = {}) {
      const el = row(parent, id, label, `<div class="vm-slider" data-min="${min}" data-max="${max}" data-precision="${precision}">
        <input id="${id}Range" class="vm-slider__range" type="range" aria-label="${label}"><input id="${id}" class="vm-slider__value vm-mono" type="text" inputmode="decimal" aria-label="${label} value" value="${min}"></div>`);
      el.lastElementChild.classList.add('vm-field-control--slider');
      const component = deps.createSlider(el.querySelector('.vm-slider'));
      bindLookRow(el, id, label, getter, setter);
      for (const type of ['input', 'change']) $(id).addEventListener(type, event => {
        if (type === 'input' && document.activeElement === $(id)) return;
        const value = Number($(id).value); if (Number.isFinite(value)) setter(Math.max(min, Math.min(max, value)), type);
      });
      controls.push(state => {
        el.hidden = options.visible ? !options.visible(state) : false;
        component.setDisabled(options.disabled ? options.disabled(state) : false);
        if (document.activeElement !== $(id)) component.setValue(getter(state));
      });
    }
    function color(parent, id, label, getter, setter, visible = () => true) {
      const el = row(parent, id, label, `<span class="vm-color-swatch"><input id="${id}" class="vm-color-swatch__input" type="color" aria-label="${label}"><span class="vm-color-swatch__preview" aria-hidden="true"></span></span>`);
      bindLookRow(el, id, label, getter, setter);
      $(id).oninput = () => setter($(id).value, 'input'); $(id).onchange = () => setter($(id).value, 'change');
      controls.push(state => { el.hidden = !visible(state); $(id).value = getter(state); $(id).nextElementSibling.style.backgroundColor = getter(state); });
    }
    select('geometryFields', 'appearanceConnector', 'Bond shape', [['cylinder','Cylinders'],['kit','Kit connectors']], s => s.rendering.geometry.connector,
      value => edit('geometry', { connector: value }));
    slider('geometryFields', 'appearanceAtomSize', 'Atom scale', 0.1, 3, 2, s => s.rendering.geometry.atomScaleMain,
      (value, phase) => edit('geometry', { atomScaleMain: value }, phase));
    slider('geometryFields', 'appearanceMetalSize', 'Metal scale', 0.1, 3, 2, s => s.rendering.geometry.atomScaleTransitionMetal,
      (value, phase) => edit('geometry', { atomScaleTransitionMetal: value }, phase));
    slider('geometryFields', 'appearanceBondRadius', 'Bond radius', 0.01, 0.4, 3, s => s.rendering.geometry.bondRadius,
      (value, phase) => edit('geometry', { bondRadius: value }, phase));
    $('appearanceBondRadius').setAttribute('aria-describedby', 'bondRadiusStatus');
    slider('geometryFields', 'appearanceCollarRadius', 'Joint radius', 0.01, 0.4, 3, s => s.rendering.geometry.kitCollarRadius,
      (value, phase) => edit('geometry', { kitCollarRadius: value }, phase), { visible: s => s.rendering.geometry.connector === 'kit' });
    toggle('geometryFields', 'appearanceCurvedBonds', 'Curved bonds', s => s.rendering.geometry.curvedMultipleBonds,
      value => edit('geometry', { curvedMultipleBonds: value }), s => s.rendering.geometry.connector === 'kit');

    const elements = Object.entries(global.ATOM_Z_TO_DATA || {}).map(([z, data]) => [z, data.symbol]);
    select('atomRadiusFields','appearanceRadiusElement','Element',elements,() => radiusElement,value => { radiusElement=value; sync(); });
    const radius = s => s.rendering.geometry.atomRadii[radiusElement] ?? deps.getAtomBaseRadius(Number(radiusElement));
    slider('atomRadiusFields','appearanceElementRadius','Radius (Å)',0.05,2,3,radius,(value,phase) =>
      edit('geometry',{atomRadii:{...deps.getRendering().geometry.atomRadii,[radiusElement]:value}},phase));
    const radiusActions = document.createElement('div'); radiusActions.className='vm-popover__actions';
    radiusActions.innerHTML='<button id="appearanceRadiusReset" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Use covalent radius</button><button id="appearanceRadiiReset" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Reset all radii</button>';
    $('atomRadiusFields').append(radiusActions);
    $('appearanceRadiusReset').onclick=()=>{const atomRadii={...deps.getRendering().geometry.atomRadii};delete atomRadii[radiusElement];edit('geometry',{atomRadii});};
    $('appearanceRadiiReset').onclick=()=>edit('geometry',{atomRadii:{}});
    controls.push(s=>{
      const radii=s.rendering.geometry.atomRadii;
      $('appearanceRadiusReset').disabled=!(radiusElement in radii);
      $('appearanceRadiiReset').disabled=!Object.keys(radii).length;
      for(const option of $('appearanceRadiusElement').options) option.textContent=(global.ATOM_Z_TO_DATA[option.value]?.symbol || option.value)+(option.value in radii?' · Custom':'');
      $('atomRadiusStatus').textContent='Base display radii; atom scales apply afterward. '+(Object.keys(radii).length?'Custom: '+Object.entries(radii).map(([z,r])=>`${global.ATOM_Z_TO_DATA[z]?.symbol || z} ${r} Å`).join(', ')+'.':'Using half the covalent radii.');
    });
    for(const [key,id,label,min] of [['sphereWidthSegments','SphereSegments','Sphere segments',3],['sphereHeightSegments','SphereRings','Sphere rings',2],['bondRadialSegments','BondSegments','Bond segments',3],['bondHeightSegments','BondRings','Bond rings',1]]) {
      slider('meshDetailFields','appearance'+id,label,min,128,0,s=>s.rendering.geometry[key],(value,phase)=>edit('geometry',{[key]:Math.round(value)},phase),
        {visible:s=>key!=='bondHeightSegments'||s.rendering.geometry.connector==='cylinder'});
    }

    const { materialFamilies, materialPresets, materialRecipe } = global.VibeMolLooks;
    select('materialFields', 'appearanceMaterialFamily', 'Family', materialFamilies.map(({ id, name }) => [id, name]), s => s.material.model,
      value => {
        activeMaterialId = null;
        const recipe = materialRecipe(materialFamilies.find(item => item.id === value).defaultRecipe);
        edit('material', recipe.material, 'change', { replace: true, restoreSurfaceMaterial: recipe.surfaceMaterial });
      });
    $('appearanceMaterialFamily').setAttribute('data-tooltip', 'Start a family with Basic, Classic, or Toon. Appearance Undo restores the previous material.');
    // Reserve the same reset gutter as Recipe; its reset restores both rows.
    if (deps.showBindings) $('appearanceMaterialFamilyRow').classList.add('vm-style-property');
    const swatchSelect = select('materialFields', 'appearanceMaterialPreset', 'Recipe', [['custom','Custom']], s => s.swatch,
      value => { if (value === 'custom') return; const saved = deps.getMaterials().find(item => item.id === value);
        activeMaterialId = saved?.id || null;
        if (saved) $('materialName').value = saved.name;
        const recipe = saved ? { material: saved.material, surfaceMaterial: null } : materialRecipe(value);
        edit('material', recipe.material, 'change', { replace: true, restoreSurfaceMaterial: recipe.surfaceMaterial }); });
    let recipeMenuKey = null;
    bindLookRow($('appearanceMaterialPresetRow'), 'materialRecipe', 'material',
      s => ({ material: s.rendering.material, surfaceMaterial: s.rendering.surfaceMaterial }),
      value => edit('material', value.material, 'change', { replace: true, restoreSurfaceMaterial: value.surfaceMaterial }),
      (a, b) => M.materialEqual(a.material, b.material) && M.materialEqual(a.surfaceMaterial, b.surfaceMaterial));
    $('appearanceUseSurfaceMaterial').onclick=()=>edit('material',deps.getRendering().surfaceMaterial,'change',{replace:true});
    const consumes = key => s => s.parameters.active.includes(key);
    for (const [id, label, key, min, max, precision, parent] of [
      ['Roughness','Roughness','roughness',0,1,3,'materialFields'],
      ['Shininess','Shininess','shininess',0,250,1,'materialFields'],
      ['Highlight','Highlight','specularIntensity',0,2,2,'materialAdvancedFields'],
      ['Metalness','Metalness','metalness',0,1,2,'materialFields'],
      ['Clearcoat','Clearcoat','clearcoat',0,1,2,'materialFields'],
      ['CoatRoughness','Coat roughness','clearcoatRoughness',0,1,3,'materialAdvancedFields'],
      ['Environment','Reflections','envMapIntensity',0,2,2,'materialFields'],
      ['Reflectivity','Reflectivity','reflectivity',0,1,2,'materialAdvancedFields'],
      ['EmissionScale','Fill scale','emissiveScale',0,1,3,'materialAdvancedFields'],
      ['EmissionMix','Fill blend','emissiveMix',0,1,3,'materialAdvancedFields'],
      ['Iridescence','Pearlescence','iridescence',0,1,2,'materialFields'],
    ]) slider(parent, 'appearanceMaterial'+id, label, min,max,precision,s => s.material[key], (value,phase) => edit('material',{[key]:value},phase),
      { visible: consumes(key) });
    slider('materialFields','appearanceToonBands','Bands',2,8,0,s=>s.material.toonSteps.length,(value,phase)=>edit('material',{toonSteps:Array.from({length:Math.round(value)},(_,i)=>Math.round(255*i/(Math.round(value)-1)))},phase),{visible:consumes('toonSteps')});
    for(let i=0;i<8;i++) slider('materialFields','appearanceToonTone'+i,'Band '+(i+1),0,255,0,s=>s.material.toonSteps[i]??0,
      (value,phase)=>{const toonSteps=[...deps.getRendering().material.toonSteps];toonSteps[i]=Math.round(value);edit('material',{toonSteps},phase);},
      {visible:s=>consumes('toonSteps')(s)&&i<s.material.toonSteps.length});
    for(const [i,label] of [[0,'Pearl minimum'],[1,'Pearl maximum']]) slider('materialAdvancedFields','appearancePearlThickness'+i,label,0,1000,0,s=>s.material.iridescenceThicknessRange[i],
      (value,phase)=>{const range=[...deps.getRendering().material.iridescenceThicknessRange];range[i]=value;range[1-i]=i===0?Math.max(value,range[1]):Math.min(value,range[0]);edit('material',{iridescenceThicknessRange:range},phase);},
      {visible:consumes('iridescenceThicknessRange')});
    color('materialFields','appearanceSpecularColor','Highlight color',s=>s.material.specularColor,(value,phase)=>edit('material',{specularColor:value},phase),consumes('specularColor'));
    slider('materialFields','appearanceMaterialEmission','Color fill',0,2,2,s=>s.material.emissiveIntensity,(value,phase)=>edit('material',{emissiveIntensity:value},phase));
    color('materialFields','appearanceMaterialTint','Tint',s=>s.material.tint,(value,phase)=>edit('material',{tint:value},phase));
    toggle('materialAdvancedFields','appearanceEmissionUsesColor','Fill from color',s=>s.material.emissiveUsesColor,value=>edit('material',{emissiveUsesColor:value}),consumes('emissiveUsesColor'));
    color('materialAdvancedFields','appearanceEmissionColor','Emission color',s=>s.material.emissiveColor,(value,phase)=>edit('material',{emissiveColor:value},phase),consumes('emissiveColor'));

    for (const [atomParent, bondParent, prefix] of [['appearanceAtomColorFields','appearanceBondColorFields','appearance'],['studioAtomColorFields','studioBondColorFields','studio']]) {
      if (deps.consolidated && prefix === 'appearance') continue;
      select(atomParent,prefix+'Palette','Palette',[['basic','Standard'],['toon','Luminous'],['kit','Kit']],s=>s.rendering.coloring.palette,value=>edit('coloring',{palette:value}));
      select(bondParent,prefix+'BondColorMode','Bond colors',[['element','By element'],['uniform','Uniform']],s=>s.rendering.coloring.elementBonds?'element':'uniform',value=>edit('coloring',{elementBonds:value==='element'}));
      color(bondParent,prefix+'BondColor','Color',s=>s.rendering.coloring.bondColor,(value,phase)=>edit('coloring',{bondColor:value},phase));
      controls.push(s=>{const label=s.rendering.coloring.elementBonds?'Bond tint':'Bond color';$(prefix+'BondColorRow').querySelector('label').textContent=label;$(prefix+'BondColor').setAttribute('aria-label',label);});
    }
    toggle('studioAtomColorFields','studioElementColors','Use element colors',s=>s.settings['global.elementColors'],value=>deps.editSettings({'global.elementColors':value}));
    row('studioAtomColorFields','studioElementColorEdit','Element colors','<button id="studioElementColorEdit" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Edit…</button>');
    $('studioElementColorEdit').onclick=()=>deps.openElementColors();

    toggle('lightingFields','studioShadows','Shadows',s=>s.settings['molecule.feature.shadows'],value=>deps.editSettings({'molecule.feature.shadows':value}));
    toggle('lightingFields','studioFog','Fog',s=>s.settings['molecule.feature.fog'],value=>deps.editSettings({'molecule.feature.fog':value}));
    slider('lightingFields','studioFogDepth','Fog depth',6,40,1,s=>s.settings['molecule.feature.fog.depth'],(value,phase)=>deps.editSettings({'molecule.feature.fog.depth':value},phase),
      {visible:s=>s.settings['molecule.feature.fog']});
    color('studioBackgroundFields','appearanceBackgroundColor','Background',s=>s.settings['global.backgroundColor'],
      (value,phase)=>deps.editBackgroundColor(value,phase));
    $('appearanceBackgroundColor').setAttribute('data-tooltip','Scene background, shared with Appearance → Scene and included in the color scheme.');
    toggle('studioBackgroundFields','appearanceFollowTheme','Follow UI theme',s=>s.rendering.lighting.followTheme,value=>edit('lighting',{followTheme:value}));
    $('appearanceFollowTheme').setAttribute('data-tooltip','Darken the chosen background when the app uses its dark theme.');
    for (const [key,label,min,max] of [['dirIntensity','Key light',0,6],['hemiIntensity','Fill light',0,6],['rimIntensity','Rim light',0,6],['ambIntensity','Ambient',0,6],['exposure','Exposure',0.4,2]]) {
      slider('lightingFields','appearanceLight'+key,label,min,max,2,s=>s.rendering.lighting[key],(value,phase)=>edit('lighting',{[key]:value},phase),
        {disabled:s=>key==='exposure'&&s.rendering.lighting.toneMapping==='none'});
    }
    select('lightingFields','appearanceToneMapping','Tone mapping',[['linear','Linear'],['aces','Studio (ACES)'],['none','None']],s=>s.rendering.lighting.toneMapping,value=>edit('lighting',{toneMapping:value}));
    const direction = (s,key) => { const [x,y,z]=s.rendering.lighting[key]; return [Math.atan2(x,z)*180/Math.PI,Math.atan2(y,Math.hypot(x,z))*180/Math.PI]; };
    function lightAngle(key,axis,value,phase) { const rendering=deps.getRendering(), radius=Math.hypot(...rendering.lighting[key]), angles=direction({rendering},key); angles[axis]=value; const [a,b]=angles.map(v=>v*Math.PI/180); edit('lighting',{[key]:[radius*Math.sin(a)*Math.cos(b),radius*Math.sin(b),radius*Math.cos(a)*Math.cos(b)]},phase); }
    for (const [key,id,label] of [['dirPos','Light','Key'],['rimPos','Rim','Rim']]) {
      slider('lightingFields','appearance'+id+'Azimuth',label+' angle',-180,180,1,s=>direction(s,key)[0],(v,p)=>lightAngle(key,0,v,p));
      slider('lightingFields','appearance'+id+'Elevation',label+' height',-90,90,1,s=>direction(s,key)[1],(v,p)=>lightAngle(key,1,v,p));
      for(const [axis,name] of ['X','Y','Z'].entries()) slider('lightPositionFields','appearance'+id+'Position'+name,label+' '+name,-10,10,2,s=>s.rendering.lighting[key][axis],
        (value,phase)=>{const position=[...deps.getRendering().lighting[key]];position[axis]=value;edit('lighting',{[key]:position},phase);});
    }
    const relativeContours=s=>s.rendering.effects.outlineWidth===0&&(s.rendering.effects.atomOutlineFraction>0||s.rendering.effects.bondOutlineFraction>0);
    select('lightingFields','appearanceContourMode','Contour sizing',[['absolute','Fixed width'],['relative','Relative']],s=>relativeContours(s)?'relative':'absolute',
      value=>edit('effects',value==='relative'?{outlineWidth:0,atomOutlineFraction:0.08,bondOutlineFraction:0.18}:{outlineWidth:0.01,atomOutlineFraction:0,bondOutlineFraction:0}));
    slider('lightingFields','appearanceContours','Width (Å)',0,0.04,3,s=>s.rendering.effects.outlineWidth,
      (value,phase)=>edit('effects',{outlineWidth:value,atomOutlineFraction:0,bondOutlineFraction:0},phase),{visible:s=>!relativeContours(s)});
    slider('lightingFields','appearanceAtomContours','Atom contours',0,0.2,3,s=>s.rendering.effects.atomOutlineFraction,
      (value,phase)=>edit('effects',{atomOutlineFraction:value},phase),{visible:relativeContours});
    slider('lightingFields','appearanceBondContours','Bond contours',0,0.3,3,s=>s.rendering.effects.bondOutlineFraction,
      (value,phase)=>edit('effects',{bondOutlineFraction:value},phase),{visible:relativeContours});
    toggle('lightingFields','appearanceHighlights','Highlight shells',s=>s.rendering.effects.highlights,value=>edit('effects',{highlights:value}));
    for (const [key,label] of [['dirColor','Key color'],['hemiColor','Fill color'],['hemiGroundColor','Ground color'],['rimColor','Rim color'],['ambColor','Ambient color']]) color('lightColorFields','appearanceLight'+key,label,s=>s.rendering.lighting[key],(value,phase)=>edit('lighting',{[key]:value},phase));

    select('studioSurfaceColorFields','studioSurfaceScheme','Default palette',deps.surfaceColorSchemes,s=>s.settings['surface.colorScheme'],value=>deps.editSurfaceDefaults({'surface.colorScheme':value}));
    for (const [key,label] of [['posColor','Default positive'],['negColor','Default negative']]) {
      color('studioSurfaceColorFields','studioSurface'+key,label,s=>s.settings['surface.'+key],(value,phase)=>deps.editSurfaceDefaults({['surface.'+key]:value},phase),s=>s.settings['surface.colorScheme']==='custom');
    }
    if (!deps.consolidated) {
    slider('surfaceDefaultFields','studioSurfaceOpacity','Opacity',0.05,1,2,s=>s.surface['surface.opacity'],(value,phase)=>deps.editSurfaceSelection({'surface.opacity':value},phase));
    $('studioResetSurfaceOverrides').onclick=()=>deps.resetSurfaceOverrides();
    controls.push(()=>{
      $('appearanceSurfaceDefaultsSection').hidden=!deps.hasSurfaceSelection();
      const counts=deps.getSurfaceOverrideCounts();
      $('studioSurfaceOverridesStatus').textContent=`Color overrides: ${counts.colors} · Opacity overrides: ${counts.opacity}`;
      $('studioResetSurfaceOverrides').disabled=!counts.colors&&!counts.opacity;
    });
    } else $('appearanceSurfaceDefaultsSection').remove();

    row('materialLibraryFields','materialName','Name','<input id="materialName" type="text" maxlength="60" aria-label="Material name">');
    const actions=document.createElement('div');actions.className='vm-popover__actions';actions.innerHTML='<button id="saveMaterial" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Save as new</button><button id="exportMaterial" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Export</button><button id="importMaterial" class="vm-btn vm-btn--ghost vm-btn--sm" type="button">Import</button><input id="materialFile" type="file" accept=".json,application/json" hidden>';$('materialLibraryFields').append(actions);
    $('saveMaterial').onclick=()=>deps.saveMaterial($('materialName').value, currentMaterial());
    const manage=document.createElement('div');manage.className='vm-popover__actions';manage.innerHTML='<button id="updateMaterial" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Update saved</button><button id="deleteMaterial" class="vm-btn vm-btn--ghost vm-btn--sm" type="button" disabled>Delete saved</button>';$('materialLibraryFields').append(manage);
    $('updateMaterial').onclick=()=>deps.updateMaterial(activeMaterialId,$('materialName').value,currentMaterial());
    $('deleteMaterial').onclick=()=>{deps.deleteMaterial(activeMaterialId);activeMaterialId=null;sync();};
    $('exportMaterial').onclick=()=>deps.exportMaterial($('materialName').value || 'My material', currentMaterial());
    $('importMaterial').onclick=()=>$('materialFile').click();
    $('materialFile').onchange=async()=>{const file=$('materialFile').files[0];$('materialFile').value='';if(file)await deps.importMaterial(file);};
    function currentMaterial() {
      return deps.getRendering().material;
    }
    function sync() {
      const rendering=deps.getRendering(), settings=deps.captureSettings(), material=currentMaterial();
      const state={rendering,settings,material,parameters:M.materialParameters(material),surface:deps.captureSurfaceSettings(),swatch:'custom'};
      $('appearanceUseSurfaceMaterial').hidden=!rendering.surfaceMaterial;
      const saved=deps.getMaterials();
      const recipes=materialPresets.filter(item=>item.family===material.model);
      const familySaved=saved.filter(item=>item.material.model===material.model).sort((a,b)=>a.name.localeCompare(b.name));
      const menuKey=JSON.stringify([material.model,familySaved.map(({id,name})=>[id,name])]);
      // Keep the select and its options stable during slider edits and redraws.
      if(menuKey!==recipeMenuKey) {
        const custom=new Option('Custom','custom'); custom.disabled=true;
        swatchSelect.replaceChildren(custom);
        for(const item of recipes)swatchSelect.add(new Option(item.name,item.id));
        if(familySaved.length) {
          const group=document.createElement('optgroup');group.label='My materials';
          for(const item of familySaved)group.append(new Option(item.name,item.id));
          swatchSelect.append(group);
        }
        recipeMenuKey=menuKey;
      }
      const matchesRecipe = recipe => M.materialEqual(recipe.material, material) && M.materialEqual(recipe.surfaceMaterial, rendering.surfaceMaterial);
      $('appearanceMaterialScope').textContent = !rendering.surfaceMaterial
        ? 'One material for atoms, bonds, and surfaces.'
        : 'This saved appearance uses a separate surface finish. Material edits apply to atoms, bonds, and surfaces.';
      state.swatch = (!rendering.surfaceMaterial && familySaved.find(item => item.id===activeMaterialId && M.materialEqual(item.material,material))?.id)
        || (!rendering.surfaceMaterial && familySaved.find(item => M.materialEqual(item.material,material))?.id)
        || recipes.find(({id}) => matchesRecipe(materialRecipe(id)))?.id || 'custom';
      if (!familySaved.some(item=>item.id===activeMaterialId)) activeMaterialId=null;
      if (state.swatch.startsWith('user-')) activeMaterialId=state.swatch;
      const activeSaved=familySaved.find(item=>item.id===activeMaterialId);
      $('updateMaterial').disabled=!activeSaved;$('deleteMaterial').disabled=!activeSaved;
      for(const fn of controls)fn(state);
      $('appearanceMaterialChannels').hidden=!Array.from($('materialAdvancedFields').children).some(el=>!el.hidden);
    }
    return Object.freeze({sync,currentMaterial});
  }
  global.VibeMolAppearanceEditor=Object.freeze({createController});
})(window);
