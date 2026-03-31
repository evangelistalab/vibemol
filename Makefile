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
	assets/app/js/bond-editing.js \
	assets/app/js/edit-ui.js \
	assets/app/js/edit-placement.js \
	assets/app/js/edit-tools.js \
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
