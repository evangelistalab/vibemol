(function (global) {
  'use strict';

  function createAppearanceInspectorController(deps) {
    const surfacesSectionEl = deps && deps.surfacesSectionEl ? deps.surfacesSectionEl : null;
    const twoComponentSectionEl = deps && deps.twoComponentSectionEl ? deps.twoComponentSectionEl : null;
    const cloudSectionEl = deps && deps.cloudSectionEl ? deps.cloudSectionEl : null;
    const getCurrentVolume = deps && deps.getCurrentVolume;
    const getRenderMode = deps && deps.getRenderMode;
    const hasSurfaceControls = deps && deps.hasSurfaceControls;
    const normalizeStyleKey = deps && deps.normalizeStyleKey;
    const getActiveStyle = deps && deps.getActiveStyle;
    const styleGroupEl = deps && deps.styleGroupEl ? deps.styleGroupEl : null;
    const onStyleSelected = typeof (deps && deps.onStyleSelected) === 'function' ? deps.onStyleSelected : null;
    const fontPairGroupEl = deps && deps.fontPairGroupEl ? deps.fontPairGroupEl : null;
    const getFontPair = typeof (deps && deps.getFontPair) === 'function' ? deps.getFontPair : null;
    const onFontPairSelected = typeof (deps && deps.onFontPairSelected) === 'function' ? deps.onFontPairSelected : null;
    const buttonGroups = Array.isArray(deps && deps.buttonGroups) ? deps.buttonGroups.slice() : [];
    const mirrorToggles = Array.isArray(deps && deps.mirrorToggles) ? deps.mirrorToggles.slice() : [];

    if (typeof getCurrentVolume !== 'function' || typeof getRenderMode !== 'function' || typeof hasSurfaceControls !== 'function') {
      throw new Error('VibeMolAppearanceUi requires section state readers.');
    }

    function getGroupButtons(rootEl) {
      return rootEl ? Array.from(rootEl.querySelectorAll('.vm-button-group__item[data-value]')) : [];
    }

    function syncButtonGroup(group) {
      if (!group || !group.rootEl) return;
      const buttons = getGroupButtons(group.rootEl);
      if (!buttons.length) return;
      const currentValue = String(typeof group.getValue === 'function' ? group.getValue() : '').trim();
      const disabledValues = typeof group.getDisabledValues === 'function'
        ? new Set(Array.from(group.getDisabledValues() || []).map((value) => String(value).trim()))
        : null;
      const groupDisabled = !!(typeof group.isDisabled === 'function' && group.isDisabled());
      for (const buttonEl of buttons) {
        const value = String(buttonEl.dataset.value || '').trim();
        const active = value === currentValue;
        const disabled = groupDisabled || (disabledValues ? disabledValues.has(value) : false);
        buttonEl.setAttribute('aria-checked', active ? 'true' : 'false');
        buttonEl.classList.toggle('active', active);
        buttonEl.disabled = disabled;
        buttonEl.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
    }

    function syncAllButtonGroups() {
      for (const group of buttonGroups) syncButtonGroup(group);
    }

    function syncMirrorToggle(toggle) {
      if (!(toggle && toggle.inputEl)) return;
      const checked = !!(typeof toggle.getChecked === 'function' ? toggle.getChecked() : toggle.inputEl.checked);
      const disabled = !!(typeof toggle.isDisabled === 'function' ? toggle.isDisabled() : toggle.inputEl.disabled);
      toggle.inputEl.checked = checked;
      toggle.inputEl.disabled = disabled;
      toggle.inputEl.setAttribute('aria-checked', checked ? 'true' : 'false');
      toggle.inputEl.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }

    function syncMirrorToggles() {
      for (const toggle of mirrorToggles) syncMirrorToggle(toggle);
    }

    function syncStyleState(nextStyle = undefined) {
      if (!styleGroupEl || typeof normalizeStyleKey !== 'function' || typeof getActiveStyle !== 'function') return;
      const activeStyle = normalizeStyleKey(nextStyle == null ? getActiveStyle() : nextStyle);
      syncButtonGroup({
        rootEl: styleGroupEl,
        getValue: () => activeStyle,
      });
    }

    function syncFontPairState(nextFontPair = undefined) {
      if (!fontPairGroupEl || !getFontPair) return;
      const active = String(nextFontPair == null ? getFontPair() : nextFontPair || 'geist').trim().toLowerCase() || 'geist';
      syncButtonGroup({
        rootEl: fontPairGroupEl,
        getValue: () => active,
      });
    }

    function syncSections(vol = undefined, renderMode = undefined) {
      const activeVol = vol || getCurrentVolume() || null;
      const activeRenderMode = renderMode == null ? getRenderMode() : renderMode;
      const hasSurfaceSection = !!hasSurfaceControls(activeVol);
      const showTwoComponent = !!(hasSurfaceSection && activeVol && activeVol.isTwoComponent);
      const showCloudOptions = !!(hasSurfaceSection && activeRenderMode === 'cloud');
      if (surfacesSectionEl) surfacesSectionEl.hidden = !hasSurfaceSection;
      if (twoComponentSectionEl) twoComponentSectionEl.hidden = !showTwoComponent;
      if (cloudSectionEl) cloudSectionEl.hidden = !showCloudOptions;
      syncMirrorToggles();
      syncAllButtonGroups();
    }

    function syncActionToggles() {
      syncMirrorToggles();
      syncAllButtonGroups();
    }

    function syncAll(vol = undefined, renderMode = undefined, style = undefined) {
      syncStyleState(style);
      syncSections(vol, renderMode);
      syncMirrorToggles();
      syncAllButtonGroups();
      syncFontPairState();
    }

    for (const group of buttonGroups) {
      const buttons = getGroupButtons(group.rootEl);
      for (const buttonEl of buttons) {
        buttonEl.addEventListener('click', () => {
          if (buttonEl.disabled || typeof group.setValue !== 'function') {
            syncButtonGroup(group);
            return;
          }
          const nextValue = String(buttonEl.dataset.value || '').trim();
          if (!nextValue) {
            syncButtonGroup(group);
            return;
          }
          group.setValue(nextValue);
          syncButtonGroup(group);
        });
      }
    }

    for (const toggle of mirrorToggles) {
      if (!(toggle && toggle.inputEl)) continue;
      toggle.inputEl.addEventListener('change', () => {
        if (toggle.inputEl.disabled || typeof toggle.setChecked !== 'function') {
          syncMirrorToggle(toggle);
          return;
        }
        toggle.setChecked(!!toggle.inputEl.checked);
        syncMirrorToggle(toggle);
      });
    }

    if (fontPairGroupEl && onFontPairSelected) {
      for (const buttonEl of getGroupButtons(fontPairGroupEl)) {
        buttonEl.addEventListener('click', () => {
          if (buttonEl.disabled) {
            syncFontPairState();
            return;
          }
          const nextValue = String(buttonEl.dataset.value || '').trim().toLowerCase();
          if (!nextValue) {
            syncFontPairState();
            return;
          }
          onFontPairSelected(nextValue);
          syncFontPairState(nextValue);
        });
      }
    }

    if (styleGroupEl && onStyleSelected) {
      for (const buttonEl of getGroupButtons(styleGroupEl)) {
        buttonEl.addEventListener('click', () => {
          if (buttonEl.disabled) {
            syncStyleState();
            return;
          }
          const nextValue = String(buttonEl.dataset.value || '').trim();
          if (!nextValue) {
            syncStyleState();
            return;
          }
          onStyleSelected(nextValue);
          syncStyleState(nextValue);
        });
      }
    }

    return Object.freeze({
      syncAll,
      syncActionToggles,
      syncFontPairState,
      syncSections,
      syncStyleState,
    });
  }

  global.VibeMolAppearanceUi = Object.freeze({
    createAppearanceInspectorController,
  });
})(window);
