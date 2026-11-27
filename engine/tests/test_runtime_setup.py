import json
from pathlib import Path

import pytest

from sdp_xray import runtime_setup as runtime

ROOT = Path(__file__).resolve().parents[1]


def host(cap="7.5", driver="591.74", mask=None):
    return {"system": "Windows", "machine": "AMD64", "os_version": "test",
            "cuda_visible_devices": mask, "cuda_device_order": None, "adapters": [],
            "nvidia_devices": [{"index": "0", "uuid": "GPU-first", "compute_cap": cap,
                                "driver_version": driver, "name": "Example GPU"}]}


@pytest.mark.parametrize("cap,driver,mask,expected", [
    ("7.5", "591.74", None, "cu126"),
    ("5.2", "591.74", None, "cu126"),  # same-major native cubin compatibility
    ("8.9", "591.74", None, "cu126"),
    ("12.0", "591.74", None, "cpu"),  # cu128 installation disabled pending qualification
    ("3.5", "591.74", None, "cpu"),
    ("7.5", "500.00", None, "cpu"),
    (None, "591.74", None, "cpu"),
    ("7.5", "591.74", "", "cpu"),
    ("7.5", "591.74", "-1", "cpu"),
    ("7.5", "591.74", "GPU-first", "cu126"),
    ("7.5", "591.74", "0", "cu126"),
    ("7.5", "591.74", "1", "cpu"),
])
def test_candidate_selection(cap, driver, mask, expected):
    result = runtime.select_profile(host(cap, driver, mask), runtime.load_profiles(ROOT))
    assert result["profile"]["backend"] == expected
    assert result["profile"]["qualification"] == "required"


def test_numeric_visibility_does_not_assume_nvidia_smi_order():
    details = host(mask="0")
    details["nvidia_devices"].append({"uuid": "GPU-second", "index": "1",
                                      "compute_cap": "12.0", "driver_version": "591.74"})
    profiles = runtime.load_profiles(ROOT)
    assert runtime.select_profile(details, profiles)["profile"]["backend"] == "cpu"
    details["cuda_visible_devices"] = "GPU-first"
    assert runtime.select_profile(details, profiles)["profile"]["backend"] == "cu126"


@pytest.mark.parametrize("device", ["cuda:1", "cuda:-1", "gpu", "mps", "cuda"])
def test_invalid_or_unavailable_override(device):
    with pytest.raises(ValueError):
        runtime.select_profile(host(), runtime.load_profiles(ROOT), device)


def test_unsupported_os_and_cpu_override():
    profiles = runtime.load_profiles(ROOT)
    assert runtime.select_profile(host(), profiles, "cpu")["profile"]["backend"] == "cpu"
    details = host()
    details["system"] = "Darwin"
    with pytest.raises(ValueError, match="Windows x64"):
        runtime.select_profile(details, profiles)


def test_fingerprint_changes_for_driver_and_mask_but_not_free_memory():
    details = host()
    original = runtime.hardware_fingerprint(details)
    details["free_bytes"] = 123
    details["errors"] = ["temporary error"]
    assert runtime.hardware_fingerprint(details) == original
    details["cuda_visible_devices"] = "0"
    assert runtime.hardware_fingerprint(details) != original
    assert runtime.hardware_fingerprint(host(driver="600.00")) != original


def test_inventory_reports_adapters_when_nvidia_smi_missing(monkeypatch):
    monkeypatch.setattr(runtime.platform, "system", lambda: "Windows")
    monkeypatch.setattr(runtime.shutil, "which", lambda _: None)
    monkeypatch.setattr(runtime, "_query", lambda _: '{"Name":"NVIDIA display adapter"}')
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "-1")
    result = runtime.inventory()
    assert result["adapters"][0]["Name"] == "NVIDIA display adapter"
    assert result["nvidia_devices"] == []
    assert "does not establish GPU absence" in result["errors"][0]
    assert result["cuda_visible_devices"] == "-1"


def test_inventory_old_driver_keeps_gpu_with_unknown_capability(monkeypatch):
    monkeypatch.setattr(runtime.platform, "system", lambda: "Linux")
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "nvidia-smi")

    def query(argv):
        if "compute_cap" in argv[1]:
            raise runtime.subprocess.CalledProcessError(1, argv)
        return "0, GPU-first, Example GPU, 450.00, 0000:01:00.0\n"

    monkeypatch.setattr(runtime, "_query", query)
    assert runtime.inventory()["nvidia_devices"][0]["compute_cap"] is None


def fake_project(tmp_path, monkeypatch):
    config = tmp_path / "config.local.json"
    config.write_text(json.dumps({"model_python": "../manual/python.exe", "checkpoint": "scan.pt"}))
    monkeypatch.setattr(runtime, "load_profiles", lambda _: PROFILES)
    monkeypatch.setattr(runtime, "inventory", host)
    monkeypatch.setattr(runtime.shutil, "which", lambda _: "uv")
    return config


PROFILES = runtime.load_profiles(ROOT)


def test_manual_config_never_overwritten_without_opt_in(tmp_path):
    config = tmp_path / "config.json"
    config.write_text('{"model_python":"manual/python.exe"}')
    before = config.read_bytes()
    with pytest.raises(ValueError, match="manual override"):
        runtime.setup(tmp_path, config)
    assert config.read_bytes() == before


def test_config_copy_keeps_demo_path_link_components(tmp_path, monkeypatch):
    config = tmp_path / "config.local.json"
    config.write_text(json.dumps({"demo_dir": "linked/demo"}))

    def no_resolve(path, *args, **kwargs):
        pytest.fail("demo_dir must retain components for the backend's link rejection")

    monkeypatch.setattr(Path, "resolve", no_resolve)
    copied = runtime._base_config(config)
    assert copied["demo_dir"] == str(tmp_path / "linked/demo")


def test_insufficient_disk_before_installer(tmp_path, monkeypatch):
    config = fake_project(tmp_path, monkeypatch)
    monkeypatch.setattr(runtime.shutil, "disk_usage", lambda _: type("Disk", (), {"free": 1})())
    monkeypatch.setattr(runtime, "prepare_environment", lambda *args: pytest.fail("installation began"))
    with pytest.raises(ValueError, match="Insufficient disk"):
        runtime.setup(tmp_path, config, managed=True)


@pytest.mark.parametrize("failure", [OSError("offline"), KeyboardInterrupt()])
def test_failed_or_cancelled_setup_preserves_config(tmp_path, monkeypatch, failure):
    config = fake_project(tmp_path, monkeypatch)
    before = config.read_bytes()
    monkeypatch.setattr(runtime.shutil, "disk_usage", lambda _: type("Disk", (), {"free": 50*runtime.GIB})())

    def fail(*args):
        raise failure

    monkeypatch.setattr(runtime, "prepare_environment", fail)
    with pytest.raises(type(failure)):
        runtime.setup(tmp_path, config, managed=True)
    assert config.read_bytes() == before
    assert not (tmp_path / ".venv-rayguard-cache/setup.lock").exists()


def test_atomic_config_write_keeps_old_file_on_replace_failure(tmp_path, monkeypatch):
    config = tmp_path / "config.json"
    config.write_text('{"old":true}')
    monkeypatch.setattr(runtime.os, "replace", lambda *args: (_ for _ in ()).throw(OSError("locked")))
    with pytest.raises(OSError):
        runtime._atomic_json(config, {"new": True})
    assert json.loads(config.read_text()) == {"old": True}
    assert list(tmp_path.glob("*.tmp")) == []


def test_managed_setup_sets_pending_config_with_separate_cpu(tmp_path, monkeypatch):
    config = fake_project(tmp_path, monkeypatch)
    monkeypatch.setattr(runtime.shutil, "disk_usage", lambda _: type("Disk", (), {"free": 50*runtime.GIB})())
    monkeypatch.setattr(runtime, "prepare_environment",
                        lambda root, profile, uv: root / profile["backend"] / "Scripts/python.exe")
    runtime.setup(tmp_path, config, managed=True)
    result = json.loads(config.read_text())
    assert result["model_python"] != result["cpu_model_python"]
    assert result["runtime_verification_required"] is True
    assert result["inference_device"] == "auto"
    assert not Path(result["runtime_state"]).exists()
    assert Path(result["checkpoint"]) == tmp_path / "scan.pt"


def test_managed_config_copy_rebases_model_paths_across_directories(tmp_path, monkeypatch):
    source = fake_project(tmp_path, monkeypatch)
    absolute_checkpoint = tmp_path / "external/generic.pt"
    source.write_text(json.dumps({
        "model_id": "author-yolov10m-device",
        "model_checkpoints": {
            "author-yolov10m-generic": str(absolute_checkpoint),
            "author-yolov10m-device": "models/device.pt",
        },
    }))
    before = source.read_bytes()
    target = tmp_path / "managed/config.local.json"
    monkeypatch.setattr(runtime.shutil, "disk_usage", lambda _: type("Disk", (), {"free": 50*runtime.GIB})())
    monkeypatch.setattr(runtime, "prepare_environment",
                        lambda root, profile, uv: root / profile["backend"] / "Scripts/python.exe")
    runtime.setup(tmp_path, target, managed=True, source_config=source)
    result = json.loads(target.read_text())
    assert result["model_id"] == "author-yolov10m-device"
    assert result["model_checkpoints"] == {
        "author-yolov10m-generic": str(absolute_checkpoint.resolve()),
        "author-yolov10m-device": str((source.parent / "models/device.pt").resolve()),
    }
    assert source.read_bytes() == before


def test_concurrent_config_edit_is_not_lost(tmp_path, monkeypatch):
    config = fake_project(tmp_path, monkeypatch)
    monkeypatch.setattr(runtime.shutil, "disk_usage", lambda _: type("Disk", (), {"free": 50*runtime.GIB})())

    def prepare(root, profile, uv):
        config.write_text('{"external_edit":true}')
        return root / "python.exe"

    monkeypatch.setattr(runtime, "prepare_environment", prepare)
    with pytest.raises(ValueError, match="Config changed"):
        runtime.setup(tmp_path, config, managed=True)
    assert json.loads(config.read_text()) == {"external_edit": True}


def test_failed_environment_has_resumable_identity_marker(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime, "_run", lambda *args: (_ for _ in ()).throw(OSError("offline")))
    with pytest.raises(OSError, match="offline"):
        runtime.prepare_environment(tmp_path, PROFILES["cpu"], "uv")
    folder = runtime.environment_path(tmp_path, PROFILES["cpu"])
    marker = json.loads((folder / "rayguard-setup.json").read_text())
    assert marker["state"] == "incomplete"
    assert marker["path"] == str(folder.resolve())
    with pytest.raises(OSError, match="offline"):
        runtime.prepare_environment(tmp_path, PROFILES["cpu"], "uv")


def test_never_adopts_an_existing_unowned_environment(tmp_path):
    folder = runtime.environment_path(tmp_path, PROFILES["cpu"])
    folder.mkdir()
    with pytest.raises(ValueError, match="unmanaged environment"):
        runtime.prepare_environment(tmp_path, PROFILES["cpu"], "uv")


def test_prepared_environment_reuse_does_not_require_download_space(tmp_path, monkeypatch):
    config = fake_project(tmp_path, monkeypatch)
    for profile in (PROFILES["cpu"], PROFILES["cu126"]):
        folder = runtime.environment_path(tmp_path, profile)
        (folder / "Scripts").mkdir(parents=True)
        (folder / "Scripts/python.exe").touch()
        runtime._atomic_json(folder / "rayguard-setup.json", {
            "state": "prepared", "path": str(folder.resolve()), "profile": profile["id"],
            "python": profile["python"], "lock_sha256": profile["lock_sha256"],
            "fork_source": profile["fork_source"],
        })
    monkeypatch.setattr(runtime.shutil, "disk_usage", lambda _: type("Disk", (), {"free": 2*1024*1024})())
    report = runtime.setup(tmp_path, config, managed=True, dry_run=True)
    assert report["download_bytes_upper_bound"] == 0
    assert report["profiles_to_prepare"] == []
    assert report["required_free_bytes"] == 1024*1024


def test_copied_environment_is_not_reused(tmp_path):
    profile = PROFILES["cpu"]
    folder = runtime.environment_path(tmp_path, profile)
    folder.mkdir()
    runtime._atomic_json(folder / "rayguard-setup.json", {
        "state": "prepared", "path": "another/project", "profile": profile["id"],
        "python": profile["python"], "lock_sha256": profile["lock_sha256"],
        "fork_source": profile["fork_source"],
    })
    assert runtime._prepared(tmp_path, profile) is False
    with pytest.raises(ValueError, match="identity changed"):
        runtime.prepare_environment(tmp_path, profile, "uv")


def test_changed_lock_is_rejected(tmp_path):
    folder = tmp_path / "environments"
    folder.mkdir()
    (folder / "profiles.json").write_text(json.dumps(PROFILES))
    (folder / PROFILES["cpu"]["lock"]).write_text("tampered")
    with pytest.raises(ValueError, match="hash differs"):
        runtime.load_profiles(tmp_path)


def test_manifests_match_exact_locks():
    for profile in PROFILES.values():
        manifest = json.loads((ROOT / "environments" /
                               f"windows-{profile['backend']}.artifacts.json").read_text())
        lock = (ROOT / "environments" / profile["lock"]).read_text()
        assert len(manifest["packages"]) == 42
        assert sum(p["size"] for p in manifest["packages"]) == profile["download_bytes"]
        for package in manifest["packages"]:
            assert f"{package['name']} @ {package['url']} --hash=sha256:{package['sha256']}" in lock
