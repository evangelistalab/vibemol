import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests" / "e2e"))

from helpers import run_http_server


@pytest.fixture(scope="session")
def app_url():
    with run_http_server(ROOT) as url:
        yield url


@pytest.fixture(scope="session")
def browser():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        instance = playwright.chromium.launch(headless=True, args=["--use-angle=swiftshader"])
        try:
            yield instance
        finally:
            instance.close()


@pytest.fixture
def page(browser):
    context = browser.new_context(viewport={"width": 1440, "height": 1080})
    try:
        yield context.new_page()
    finally:
        context.close()
