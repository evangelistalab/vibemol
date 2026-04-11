(function (global) {
  'use strict';

  function createAppearanceInspectorController(deps) {
    const documentRef = global.document;
    const displayInspectorEl = deps && deps.displayInspectorEl ? deps.displayInspectorEl : null;
    const styleChipEls = Array.isArray(deps && deps.styleChipEls) ? deps.styleChipEls : [];
    const actionToggleButtonEls = Array.isArray(deps && deps.actionToggleButtonEls) ? deps.actionToggleButtonEls : [];
    const surfacesSectionEl = deps && deps.surfacesSectionEl ? deps.surfacesSectionEl : null;
    const twoComponentSectionEl = deps && deps.twoComponentSectionEl ? deps.twoComponentSectionEl : null;
    const cloudSectionEl = deps && deps.cloudSectionEl ? deps.cloudSectionEl : null;
    const toggleMultiBondsInput = deps && deps.toggleMultiBondsInput ? deps.toggleMultiBondsInput : null;
    const elementColorsInput = deps && deps.elementColorsInput ? deps.elementColorsInput : null;
    const visibilityElementColorsToggleInput = deps && deps.visibilityElementColorsToggleInput ? deps.visibilityElementColorsToggleInput : null;
    const normalizeStyleKey = deps && deps.normalizeStyleKey;
    const onStyleChipSelected = deps && deps.onStyleChipSelected;
    const getActiveStyle = deps && deps.getActiveStyle;
    const getCurrentVolume = deps && deps.getCurrentVolume;
    const getRenderMode = deps && deps.getRenderMode;
    const hasSurfaceControls = deps && deps.hasSurfaceControls;
    const getShowMultiBonds = deps && deps.getShowMultiBonds;

    if (typeof normalizeStyleKey !== 'function' || typeof onStyleChipSelected !== 'function' || typeof getActiveStyle !== 'function') {
      throw new Error('VibeMolAppearanceUi requires style normalization and chip selection callbacks.');
    }
    if (typeof getCurrentVolume !== 'function' || typeof getRenderMode !== 'function' || typeof hasSurfaceControls !== 'function') {
      throw new Error('VibeMolAppearanceUi requires section state readers.');
    }

    const surfaceToggleButtonEl = displayInspectorEl
      ? displayInspectorEl.querySelector('.inspectorActionToggle[data-toggle-input="surfBtn"]')
      : null;

    function getActionToggleInput(buttonEl) {
      if (!buttonEl || !buttonEl.dataset || !documentRef) return null;
      const inputId = String(buttonEl.dataset.toggleInput || '').trim();
      if (!inputId) return null;
      const inputEl = documentRef.getElementById(inputId);
      return inputEl && inputEl.tagName === 'INPUT' ? inputEl : null;
    }

    function isInvertedActionToggle(buttonEl) {
      return !!(buttonEl && buttonEl.dataset && buttonEl.dataset.toggleInvert === 'true');
    }

    function syncMirrorInputs() {
      if (toggleMultiBondsInput && typeof getShowMultiBonds === 'function') {
        toggleMultiBondsInput.checked = !!getShowMultiBonds();
      }
      if (visibilityElementColorsToggleInput) {
        visibilityElementColorsToggleInput.checked = !!(elementColorsInput && elementColorsInput.checked);
      }
    }

    function syncStyleState(nextStyle = undefined) {
      if (!styleChipEls.length) return;
      const activeStyle = normalizeStyleKey(nextStyle == null ? getActiveStyle() : nextStyle);
      for (const chipEl of styleChipEls) {
        const chipStyle = normalizeStyleKey(chipEl && chipEl.dataset ? chipEl.dataset.style : '');
        const active = chipStyle === activeStyle;
        chipEl.classList.toggle('active', active);
        chipEl.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    function syncActionToggleButton(buttonEl) {
      const inputEl = getActionToggleInput(buttonEl);
      if (!buttonEl || !inputEl) return;
      const checked = isInvertedActionToggle(buttonEl) ? !inputEl.checked : !!inputEl.checked;
      const disabled = !!inputEl.disabled;
      const stateEl = buttonEl.querySelector('.inspectorActionToggleState');
      buttonEl.classList.toggle('active', checked);
      buttonEl.setAttribute('aria-pressed', checked ? 'true' : 'false');
      buttonEl.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      buttonEl.toggleAttribute('disabled', disabled);
      if (inputEl.title) buttonEl.title = inputEl.title;
      if (stateEl) stateEl.textContent = checked ? 'On' : 'Off';
    }

    function syncActionToggles() {
      syncMirrorInputs();
      for (const buttonEl of actionToggleButtonEls) {
        syncActionToggleButton(buttonEl);
      }
    }

    function syncSections(vol = undefined, renderMode = undefined) {
      const activeVol = vol || getCurrentVolume() || null;
      const activeRenderMode = renderMode == null ? getRenderMode() : renderMode;
      const hasSurfaceSection = !!hasSurfaceControls(activeVol);
      const showTwoComponent = !!(hasSurfaceSection && activeVol && activeVol.isTwoComponent);
      const showCloudOptions = !!(hasSurfaceSection && activeRenderMode === 'cloud');
      if (surfacesSectionEl) {
        surfacesSectionEl.hidden = !hasSurfaceSection;
        if (!hasSurfaceSection) surfacesSectionEl.open = false;
      }
      if (surfaceToggleButtonEl) {
        surfaceToggleButtonEl.style.display = hasSurfaceSection ? '' : 'none';
      }
      if (twoComponentSectionEl) {
        twoComponentSectionEl.hidden = !showTwoComponent;
        if (!showTwoComponent) twoComponentSectionEl.open = false;
      }
      if (cloudSectionEl) {
        cloudSectionEl.hidden = !showCloudOptions;
        if (!showCloudOptions) cloudSectionEl.open = false;
      }
      syncActionToggles();
    }

    function syncAll(vol = undefined, renderMode = undefined, style = undefined) {
      syncStyleState(style);
      syncSections(vol, renderMode);
      syncActionToggles();
    }

    for (const chipEl of styleChipEls) {
      chipEl.addEventListener('click', () => {
        const nextStyle = chipEl && chipEl.dataset ? chipEl.dataset.style : '';
        if (!nextStyle) return;
        onStyleChipSelected(nextStyle);
      });
    }

    for (const buttonEl of actionToggleButtonEls) {
      buttonEl.addEventListener('click', () => {
        const inputEl = getActionToggleInput(buttonEl);
        if (!inputEl || inputEl.disabled) {
          syncActionToggleButton(buttonEl);
          return;
        }
        const currentVisibleState = isInvertedActionToggle(buttonEl) ? !inputEl.checked : !!inputEl.checked;
        const nextVisibleState = !currentVisibleState;
        inputEl.checked = isInvertedActionToggle(buttonEl) ? !nextVisibleState : nextVisibleState;
        if (typeof inputEl.onchange === 'function') {
          inputEl.onchange();
        } else {
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncActionToggleButton(buttonEl);
      });
    }

    return Object.freeze({
      syncAll,
      syncActionToggles,
      syncSections,
      syncStyleState,
    });
  }

  global.VibeMolAppearanceUi = Object.freeze({
    createAppearanceInspectorController,
  });
})(window);
