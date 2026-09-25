JS_CHECK_FILES = \
	src/vscode_ext/vibemol/src/extension.js \
	src/vscode_ext/vibemol/src/vmWebview.js \
	src/vscode_ext/vibemol/src/folderFiles.js \
	assets/app/js/parsers.js \
	assets/app/js/rendering.js \
	assets/app/js/interaction.js \
	assets/app/js/ui.js \
	assets/app/js/view-utils.js \
	assets/app/js/edit-utils.js \
	assets/app/js/edit-commands.js \
	assets/app/js/edit-state.js \
	assets/app/js/io-utils.js \
	assets/app/js/fragments.js \
	assets/app/js/structure.js \
	assets/app/js/volume-geometry.js \
	assets/app/js/volume-2c.js \
	assets/app/js/bond-inference.js \
	assets/app/js/hydrogen-bonds.js \
	assets/app/js/bond-geometry.js \
	assets/app/js/auto-hydrogen.js \
	assets/app/js/autoiso.js \
	assets/app/js/cloud-rendering.js \
	assets/app/js/bond-editing.js \
	assets/app/js/edit-ui.js \
	assets/app/js/floating-panels.js \
	assets/app/js/workbench-model.js \
	assets/app/js/workbench.js \
	assets/app/js/appearance-looks.js \
	assets/app/js/appearance-model.js \
	assets/app/js/appearance-editor.js \
	assets/app/js/looks-ui.js \
	assets/app/js/style-studio.js \
	assets/app/js/properties-inspector.js \
	docs/experiments/style-lab/compare.js \
	assets/app/js/edit-placement.js \
	assets/app/js/edit-tools.js \
	assets/app/js/edit-gizmos.js \
	assets/app/js/edit-transform.js \
	assets/app/js/edit-gestures.js \
	assets/app/js/edit-halo.js \
	assets/app/js/preset.js \
	assets/app/js/structure-transport.js \
	assets/app/js/scene-graph.js \
	assets/app/js/scene-sources.js \
	assets/app/js/scene-export.js \
	assets/app/js/scene-outliner.js \
	assets/app/js/arithmetic-grid.js \
	assets/app/js/arithmetic-worker.js \
	assets/app/js/arithmetic-runner.js \
	assets/app/js/arithmetic-layers.js \
	assets/app/js/grid-store.js \
	assets/app/js/session-format.js \
	assets/app/js/session.js \
	assets/app/js/session-recovery.js \
	assets/app/js/file-loader.js \
	assets/app/js/trajectory-clock.js \
	assets/app/js/trajectory-ui.js \
	assets/app/js/app.js

.PHONY: check test-unit test-e2e test

check:
	@set -e; \
	for file in $(JS_CHECK_FILES); do \
		node --check $$file; \
	done
	python3 -m py_compile api/vibemol_client.py tests/e2e/helpers.py tests/e2e/smoke.py tests/e2e/premerge.py tests/e2e/sessions.py tests/e2e/looks.py tests/e2e/surface_schemes.py tests/e2e/look_tiles.py tests/e2e/look_references.py tests/e2e/surface_shadows.py tests/e2e/camera_depth.py tests/e2e/edit_picking.py tests/e2e/mode_consistency.py tests/e2e/style_studio.py tests/e2e/appearance_scopes.py tests/e2e/appearance_controls.py tests/e2e/properties_inspector.py tests/e2e/properties_disclosures.py tests/e2e/floating_panels.py tests/e2e/workbench.py tests/e2e/workbench_release.py tests/e2e/workbench_consistency.py tests/e2e/workbench_bar.py tests/e2e/build_panel.py tests/e2e/symmetry_panel.py tests/e2e/hydrogen_contacts.py tools/render_look_previews.py tools/profile_nacl_edit.py
	git diff --check

test-unit:
	node --test tests/unit/*.test.mjs

test-e2e:
	python3 tests/e2e/build_panel.py
	python3 tests/e2e/symmetry_panel.py
	python3 tests/e2e/hydrogen_contacts.py
	python3 tests/e2e/workbench_release.py
	python3 tests/e2e/smoke.py
	python3 tests/e2e/premerge.py
	python3 tests/e2e/sessions.py
	python3 tests/e2e/looks.py
	python3 tests/e2e/camera_depth.py
	python3 tests/e2e/edit_picking.py
	python3 tests/e2e/mode_consistency.py
	python3 tests/e2e/style_studio.py
	python3 tests/e2e/appearance_scopes.py
	python3 tests/e2e/properties_inspector.py
	python3 tests/e2e/properties_disclosures.py
	python3 tests/e2e/floating_panels.py
	python3 tests/e2e/workbench.py
	python3 tests/e2e/workbench_consistency.py
	python3 tests/e2e/workbench_bar.py

test: check test-unit test-e2e
