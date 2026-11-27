"""Selection/provenance guards only: no Torch installation or GPU is needed."""

from types import SimpleNamespace

import pytest

from sdp_xray import model_runtime as runtime


@pytest.mark.parametrize("value", ["auto", "cuda", "cuda:-1", "cuda:01", "0,1", "xpu:0", "cpu ", None])
def test_device_argument_rejects_unresolved_or_ambiguous_selection(value):
    with pytest.raises(ValueError):
        runtime.device_argument(value)


def fake_torch(*, available=True, hip=None):
    chosen = []
    props = SimpleNamespace(name="Synthetic GPU", uuid="GPU-allowed", major=7, minor=5,
                            total_memory=6 * 1024**3)
    return SimpleNamespace(
        version=SimpleNamespace(cuda="12.6", hip=hip),
        device=lambda value: SimpleNamespace(type=value.split(":")[0], name=value),
        cuda=SimpleNamespace(is_available=lambda: available, device_count=lambda: 1,
                             get_device_properties=lambda index: props,
                             mem_get_info=lambda index: (3 * 1024**3, 6 * 1024**3),
                             set_device=chosen.append),
    ), chosen


def test_cpu_selection_never_requires_cuda():
    torch = SimpleNamespace(device=lambda value: value)
    assert runtime.resolve_device(torch, "cpu") == "cpu"


def test_visible_logical_index_preserves_existing_mask(monkeypatch):
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "GPU-allowed")
    torch, chosen = fake_torch()
    device = runtime.resolve_device(torch, "cuda:0", "GPU-allowed")
    assert chosen == [device]
    assert device.name == "cuda:0"
    assert runtime.os.environ["CUDA_VISIBLE_DEVICES"] == "GPU-allowed"
    with pytest.raises(runtime.RuntimeCheckError) as failure:
        runtime.resolve_device(torch, "cuda:1")
    assert failure.value.code == "cuda_unavailable"


def test_identity_change_never_selects_another_gpu():
    torch, chosen = fake_torch()
    with pytest.raises(runtime.RuntimeCheckError) as failure:
        runtime.resolve_device(torch, "cuda:0", "GPU-previous-host")
    assert failure.value.code == "device_changed"
    assert chosen == []


@pytest.mark.parametrize("available,hip,code", [
    (False, None, "cuda_unavailable"), (True, "7.2", "incompatible_runtime"),
])
def test_explicit_cuda_never_falls_back_or_misidentifies_rocm(available, hip, code):
    torch, chosen = fake_torch(available=available, hip=hip)
    with pytest.raises(runtime.RuntimeCheckError) as failure:
        runtime.resolve_device(torch, "cuda:0")
    assert failure.value.code == code
    assert chosen == []


def test_failure_codes_do_not_parse_exception_text():
    class OutOfMemoryError(RuntimeError):
        pass

    torch = SimpleNamespace(OutOfMemoryError=OutOfMemoryError)
    gpu = SimpleNamespace(type="cuda")
    assert runtime.failure_code(ValueError("CUDA out of memory"), torch, gpu) == "inference_failed"
    assert runtime.failure_code(OutOfMemoryError("private path"), torch, gpu) == "cuda_oom"
    assert runtime.failure_code(RuntimeError("private path"), torch, gpu) == "cuda_execution_failed"


def test_version_number_alone_does_not_establish_original_fork(monkeypatch):
    wrong = SimpleNamespace(version="8.1.34", read_text=lambda _: '{"url":"https://example.org/stock"}')
    monkeypatch.setattr(runtime.metadata, "distribution", lambda _: wrong)
    with pytest.raises(runtime.RuntimeCheckError) as failure:
        runtime.upstream_source()
    assert failure.value.code == "incompatible_runtime"


def test_managed_fork_requires_reviewed_archive_hash(monkeypatch):
    import json

    source = {"url": runtime.MANAGED_UPSTREAM_URL, "archive_info": {
        "hashes": {"sha256": runtime.MANAGED_UPSTREAM_SHA256}}}
    distribution = SimpleNamespace(version="8.1.34", read_text=lambda _: json.dumps(source))
    monkeypatch.setattr(runtime.metadata, "distribution", lambda _: distribution)
    assert runtime.upstream_source() == source
    source["archive_info"]["hashes"]["sha256"] = "0" * 64
    with pytest.raises(runtime.RuntimeCheckError):
        runtime.upstream_source()


def test_managed_uv_fork_requires_successful_install_proof(monkeypatch, tmp_path):
    import json

    source = {"url": runtime.MANAGED_UPSTREAM_URL, "archive_info": {}}
    monkeypatch.setattr(runtime.metadata, "distribution", lambda _: SimpleNamespace(
        version="8.1.34", read_text=lambda _: json.dumps(source)))
    monkeypatch.setattr(runtime.sys, "prefix", str(tmp_path))
    with pytest.raises(runtime.RuntimeCheckError):
        runtime.upstream_source()
    profiles = json.loads((runtime.Path(runtime.__file__).resolve().parents[2]
                           / 'environments/profiles.json').read_text())
    proof = {"state": "prepared", "path": str(tmp_path), "profile": profiles['cpu']['id'],
             "lock_sha256": profiles['cpu']['lock_sha256'],
             "fork_source": {"url": runtime.MANAGED_UPSTREAM_URL,
                             "sha256": runtime.MANAGED_UPSTREAM_SHA256}}
    marker = tmp_path / 'rayguard-setup.json'
    marker.write_text(json.dumps(proof))
    assert runtime.upstream_source() == source
    proof['state'] = 'preparing'
    marker.write_text(json.dumps(proof))
    with pytest.raises(runtime.RuntimeCheckError):
        runtime.upstream_source()
