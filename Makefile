JS_CHECK_FILES = \
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
	assets/app/js/auto-hydrogen.js \
	assets/app/js/autoiso.js \
	assets/app/js/cloud-rendering.js \
	assets/app/js/bond-editing.js \
	assets/app/js/edit-ui.js \
	assets/app/js/edit-placement.js \
	assets/app/js/edit-tools.js \
	assets/app/js/edit-gizmos.js \
	assets/app/js/edit-transform.js \
	assets/app/js/edit-gestures.js \
	assets/app/js/edit-halo.js \
	assets/app/js/preset.js \
	assets/app/js/structure-transport.js \
	assets/app/js/scene-graph.js \
	assets/app/js/arithmetic-grid.js \
	assets/app/js/file-loader.js \
	assets/app/js/app.js

.PHONY: check test-unit test-e2e test

check:
	@set -e; \
	for file in $(JS_CHECK_FILES); do \
		node --check $$file; \
	done
	python3 -m py_compile api/vibemol_client.py tests/e2e/helpers.py tests/e2e/smoke.py
	git diff --check

test-unit:
	node --test tests/unit/*.test.mjs

test-e2e:
	python3 tests/e2e/smoke.py

test: check test-unit test-e2e
