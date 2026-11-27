import json
import subprocess
import sys

from sdp_xray.cli import PATH_SETTINGS, doctor, main


def test_doctor_without_artifacts(monkeypatch):
    for variable, _ in PATH_SETTINGS.values():
        monkeypatch.delenv(variable, raising=False)
    monkeypatch.setattr("sdp_xray.cli.shutil.which", lambda _: None)
    report = doctor()
    assert set(report["paths"].values()) == {"not_configured"}
    assert report["model_inference_verified"] is False
    assert report["gpu"]["status"] == "nvidia_smi_unavailable"


def test_config_paths_relative_to_config_and_env_override(tmp_path, monkeypatch):
    for variable, _ in PATH_SETTINGS.values():
        monkeypatch.delenv(variable, raising=False)
    monkeypatch.setattr("sdp_xray.cli.shutil.which", lambda _: None)
    (tmp_path / "annotations.json").write_text("{}")
    config = tmp_path / "project.json"
    config.write_text(json.dumps({"annotations": "annotations.json"}))
    assert doctor(config)["paths"]["annotations"] == "present_unverified"
    monkeypatch.setenv("SDP_ANNOTATIONS", str(tmp_path / "missing.json"))
    assert doctor(config)["paths"]["annotations"] == "missing_or_wrong_type"


def test_invalid_config_has_machine_readable_failure(tmp_path, capsys):
    config = tmp_path / "bad.json"
    config.write_text('{"checkpoint": 42}')
    assert main(["doctor", "--config", str(config)]) == 2
    assert json.loads(capsys.readouterr().out)["ok"] is False


def test_installed_module_help():
    result = subprocess.run(
        [sys.executable, "-m", "sdp_xray.cli", "--help"], capture_output=True, text=True
    )
    assert result.returncode == 0
    assert "audit-coco" in result.stdout
    assert "audit-stcray" in result.stdout


def test_stcray_cli_missing_root_reports_findings(tmp_path, capsys):
    assert main(["audit-stcray", str(tmp_path / "absent")]) == 1
    report = json.loads(capsys.readouterr().out)
    assert report["ok"] is False
    assert "missing_required_directory" in report["summary"]["findings"]
