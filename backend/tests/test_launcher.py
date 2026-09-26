"""The launcher only restarts after the explicit workspace callback."""

import json
from types import SimpleNamespace

import pytest

from rayguard_gui import __main__ as launcher


@pytest.mark.parametrize("supervised,request_restart,expected", [
    (True, True, 75), (True, False, 0), (False, False, 0),
])
def test_restart_is_explicit(tmp_path, monkeypatch, supervised, request_restart, expected):
    config = tmp_path / "config.local.json"
    config.write_text("{}", encoding="utf-8")
    argv = ["rayguard-gui", "--config", str(config), "--port", "8771"]
    if supervised:
        argv.append("--workspace-restart")
    monkeypatch.setattr("sys.argv", argv)
    captured = {}

    def create_app(settings, **kwargs):
        captured.update(settings=settings, **kwargs)
        return "test-app"

    class Server:
        def __init__(self, config):
            self.should_exit = False
            captured["server_config"] = config

        def run(self):
            if request_restart:
                captured["restart_callback"]()
                assert self.should_exit

    monkeypatch.setattr(launcher, "create_app", create_app)
    monkeypatch.setattr(launcher.uvicorn, "Config", lambda app, **kw: SimpleNamespace(app=app, **kw))
    monkeypatch.setattr(launcher.uvicorn, "Server", Server)
    assert launcher.main() == expected
    assert (captured["restart_callback"] is not None) == supervised
    assert captured["server_config"].host == "127.0.0.1"
    assert captured["server_config"].workers == 1


def test_explicit_device_bypasses_saved_preference(tmp_path, monkeypatch):
    config = tmp_path / "config.local.json"
    config.write_text(json.dumps({"inference_device": "auto"}), encoding="utf-8")
    config.with_suffix(".device.local.json").write_text("invalid", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["rayguard-gui", "--config", str(config), "--device", "cpu"])
    captured = {}
    monkeypatch.setattr(launcher, "create_app", lambda settings, **kw: captured.update(settings=settings))
    monkeypatch.setattr(launcher.uvicorn, "Server", lambda config: SimpleNamespace(run=lambda: None))
    assert launcher.main() == 0
    assert captured["settings"].inference_device == "cpu"


def test_no_config_cannot_enable_workspace_restart(monkeypatch):
    monkeypatch.setattr("sys.argv", ["rayguard-gui", "--workspace-restart"])
    captured = {}
    monkeypatch.setattr(launcher, "create_app", lambda settings, **kw: captured.update(**kw))
    monkeypatch.setattr(launcher.uvicorn, "Server", lambda config: SimpleNamespace(run=lambda: None))
    assert launcher.main() == 0
    assert captured["restart_callback"] is None
    assert captured["policy_store"] is None
