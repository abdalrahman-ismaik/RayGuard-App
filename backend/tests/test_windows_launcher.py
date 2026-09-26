"""Exercise real PowerShell argument routing with stub tools; no service or installer runs."""

import json
import os
import shutil
import socket
import subprocess

import pytest

from rayguard_gui.config import APP_ROOT

POWERSHELL = shutil.which("pwsh") or shutil.which("powershell")
pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="PowerShell is unavailable")


@pytest.mark.parametrize("source", ["example", "local", "managed.local"])
def test_setup_uses_engine_root_and_explicit_app_source(tmp_path, source):
    shutil.copyfile(APP_ROOT / "run-app.ps1", tmp_path / "run-app.ps1")
    engine = tmp_path / "engine"
    engine.mkdir()
    (engine / "pyproject.toml").touch()
    (tmp_path / "config.example.json").write_text("{}")
    if source != "example":
        (tmp_path / f"config.{source}.json").write_text("{}")
    log = tmp_path / "arguments.jsonl"
    stub = tmp_path / "tool.ps1"
    stub.write_text("ConvertTo-Json -InputObject @($args) -Compress | "
                    "Add-Content -LiteralPath $env:RAYGUARD_TEST_LOG\n"
                    "$global:LASTEXITCODE = 0\n")
    harness = tmp_path / "harness.ps1"
    harness.write_text("""
function Invoke-RestMethod { throw 'No existing service in software test' }
function Get-Command {
    param($Name)
    if ($Name -notin @('uv', 'npm.cmd')) { throw 'Unexpected tool request' }
    [pscustomobject]@{ Source = $env:RAYGUARD_TEST_TOOL }
}
& (Join-Path $PSScriptRoot 'run-app.ps1') -Port $env:RAYGUARD_TEST_PORT -SetupModel
""")
    # The launcher briefly checks a free port, but the stub never opens a service.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    result = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(harness)],
        env={**os.environ, "RAYGUARD_TEST_LOG": str(log), "RAYGUARD_TEST_TOOL": str(stub),
             "RAYGUARD_TEST_PORT": str(port)},
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    calls = [json.loads(line) for line in log.read_text(encoding="utf-8-sig").splitlines()]
    assert calls[0][-3:] == ["python", "-m", "rayguard_gui.engine"]
    for call in calls[1:3]:
        assert call[call.index("--project") + 1] == str(tmp_path / "backend")
        assert str(engine / "scripts/setup_model_runtime.py") in call
        assert call[call.index("--root") + 1] == str(engine)
        assert call[call.index("--source-config") + 1] == str(tmp_path / f"config.{source}.json")
    assert calls[1][-1] == "--dry-run" and "--dry-run" not in calls[2]
    assert calls[3] == ["--prefix", str(tmp_path / "frontend"), "ci"]
    assert calls[4] == ["--prefix", str(tmp_path / "frontend"), "run", "build"]
    assert calls[5][calls[5].index("--project") + 1] == str(tmp_path / "backend")
    assert "rayguard-gui" in calls[5]


def test_missing_engine_stops_before_tools_or_installation(tmp_path):
    shutil.copyfile(APP_ROOT / "run-app.ps1", tmp_path / "run-app.ps1")
    result = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
         str(tmp_path / "run-app.ps1")], capture_output=True, text=True, timeout=15,
    )
    assert result.returncode == 1
    assert "git submodule update --init --recursive" in result.stdout
