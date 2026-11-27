"""Bundled engine checks; fixtures contain no models or research data."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from rayguard_gui import api, engine
from rayguard_gui.config import APP_ROOT, REPOSITORY, Settings


@pytest.fixture
def checkout(tmp_path, monkeypatch):
    source = tmp_path / "engine"
    for name in engine.REQUIRED:
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    monkeypatch.setattr(engine, "APP_ROOT", tmp_path)
    monkeypatch.setattr(engine, "REPOSITORY", source)
    monkeypatch.setattr(engine.importlib.util, "find_spec", lambda name: SimpleNamespace(
        origin=str(source / "src/sdp_xray/__init__.py")))
    return tmp_path, source


def test_bundled_engine_is_accepted_without_git(checkout):
    _, source = checkout
    assert engine.verify_engine() == str(source)


def test_real_checkout_ships_the_engine_in_this_repository():
    assert not (APP_ROOT / ".gitmodules").exists()
    for name in engine.REQUIRED:
        assert (REPOSITORY / name).is_file(), name
    assert engine.verify_engine() == str(REPOSITORY)


@pytest.mark.parametrize("name", engine.REQUIRED)
def test_missing_engine_file_has_restore_instruction(checkout, name):
    _, source = checkout
    (source / name).unlink()
    with pytest.raises(ValueError, match="git checkout -- engine"):
        engine.verify_engine()


def test_dependency_from_another_checkout_is_rejected(checkout, monkeypatch):
    root, _ = checkout
    monkeypatch.setattr(engine.importlib.util, "find_spec", lambda name: SimpleNamespace(
        origin=str(root / "unrelated/sdp_xray/__init__.py")))
    with pytest.raises(ValueError, match="not this checkout's engine"):
        engine.verify_engine()


def test_extracted_defaults_and_frontend_are_owned_by_app(tmp_path, monkeypatch):
    assert REPOSITORY == APP_ROOT / "engine"
    assert Settings().storage_dir == APP_ROOT / "runs/gui"
    frontend = tmp_path / "frontend/dist"
    frontend.mkdir(parents=True)
    (frontend / "index.html").write_text("<title>App-owned frontend</title>")
    monkeypatch.setattr(api, "APP_ROOT", tmp_path)
    with TestClient(api.create_app(Settings(storage_dir=tmp_path / "runs")),
                    base_url="http://127.0.0.1") as client:
        assert client.get("/").text == "<title>App-owned frontend</title>"
        assert client.get("/api/health").status_code == 200
