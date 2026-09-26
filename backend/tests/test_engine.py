"""Source extraction checks; local Git fixtures contain no models or research data."""

import shutil
import subprocess
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from rayguard_gui import api, engine
from rayguard_gui.config import APP_ROOT, REPOSITORY, Settings


@pytest.fixture
def checkout(tmp_path, monkeypatch):
    if shutil.which("git") is None:
        pytest.skip("Git is required to exercise the submodule checkout guard")
    source = tmp_path / "engine"
    for name in ("pyproject.toml", "src/sdp_xray/model_catalog.py",
                 "scripts/infer_generic_yolov10.py", "scripts/setup_model_runtime.py",
                 "environments/profiles.json"):
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()

    def git(directory, *args):
        return subprocess.run(["git", "-C", str(directory), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    git(tmp_path, "init")
    git(source, "init")
    git(source, "add", ".")
    git(source, "-c", "user.name=Software fixture", "-c", "user.email=fixture@example.invalid",
        "commit", "-m", "Synthetic engine fixture")
    revision = git(source, "rev-parse", "HEAD")
    git(tmp_path, "update-index", "--add", "--cacheinfo", f"160000,{revision},engine")
    monkeypatch.setattr(engine, "APP_ROOT", tmp_path)
    monkeypatch.setattr(engine, "REPOSITORY", source)
    monkeypatch.setattr(engine.importlib.util, "find_spec", lambda name: SimpleNamespace(
        origin=str(source / "src/sdp_xray/__init__.py")))
    return tmp_path, source, revision, git


def test_pin_is_valid_before_first_app_commit_and_ignores_local_artifacts(checkout):
    _, source, revision, _ = checkout
    (source / ".venv").mkdir()
    (source / ".venv/local-cache").touch()
    assert engine.verify_engine() == revision


def test_missing_engine_has_initialization_instruction(checkout):
    _, source, _, _ = checkout
    (source / "pyproject.toml").unlink()
    with pytest.raises(ValueError, match="git submodule update --init --recursive"):
        engine.verify_engine()


def test_mismatched_gitlink_revision_is_rejected(checkout):
    root, _, _, git = checkout
    git(root, "update-index", "--cacheinfo", f"160000,{'1' * 40},engine")
    with pytest.raises(ValueError, match="differs from the app's pinned revision"):
        engine.verify_engine()


@pytest.mark.parametrize("staged", [False, True])
def test_modified_engine_source_is_rejected(checkout, staged):
    _, source, _, git = checkout
    (source / "scripts/infer_generic_yolov10.py").write_text("# changed\n")
    if staged:
        git(source, "add", ".")
    with pytest.raises(ValueError, match="Tracked engine files have local changes"):
        engine.verify_engine()


def test_missing_gitlink_is_rejected(checkout):
    root, _, _, git = checkout
    git(root, "update-index", "--force-remove", "engine")
    with pytest.raises(ValueError, match="no unambiguous engine gitlink pin"):
        engine.verify_engine()


def test_dependency_from_another_checkout_is_rejected(checkout, monkeypatch):
    root, _, _, _ = checkout
    monkeypatch.setattr(engine.importlib.util, "find_spec", lambda name: SimpleNamespace(
        origin=str(root / "unrelated/sdp_xray/__init__.py")))
    with pytest.raises(ValueError, match="not this checkout's pinned engine"):
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
