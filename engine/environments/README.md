# Managed model environments

These profiles prepare isolated **Windows x64 / CPython 3.11.9** environments for
the original THU-MIG YOLOv10 fork at commit
`453c6e38a51e9d1d5a2aa5fb7f1014a711913397`. They do not download a checkpoint,
run inference, or establish model accuracy. The app must qualify the actual
runtime before accepting managed inference.

| Profile suffix | Torch / torchvision | Automatic installation candidate |
|---|---|---|
| `cpu-v1` | 2.9.0+cpu / 0.24.0+cpu | Yes; real CPU qualification still required |
| `cu126-v1` | 2.9.0+cu126 / 0.24.0+cu126 | Compatible NVIDIA hardware/driver; real qualification required |
| `cu128-v1` | 2.9.0+cu128 / 0.24.0+cu128 | **Disabled** pending separate release qualification |

Full IDs and checked lock hashes are in `profiles.json`. CUDA profiles are
candidates, not a promise that every listed GPU can execute this checkpoint.
The separate [execution record](../../docs/runtime-verification.md) verifies the CPU
profile and CUDA 12.6 pairing on one RTX 2060 host, including real model parity
and application recovery. This does not qualify every architecture in the
candidate table. Each host still requires its own cached model verification;
second-NVIDIA-laptop and separate-CPU-host acceptance remain unexecuted.
Other GPU vendors, Windows ARM, Linux and macOS do not have enabled managed
profiles here. The inventory still reports Windows display adapters, and a
missing `nvidia-smi` does not establish GPU absence. Existing manually configured
interpreters remain supported through the app's manual configuration path.

## Prepare and launch

These profiles and the inference tools are part of the RayGuard App's own
`engine/` folder. `run-app.ps1 -SetupModel` prepares them; follow the app's
setup guide. Datasets and weights are separate inputs.

For explicit preparation from the `engine/` folder, supply the app's example
or your existing local configuration as `--source-config`, and choose a separate
output configuration. Inspect the estimate first:

```powershell
uv run --locked python scripts/setup_model_runtime.py --root . --source-config PATH_TO_SOURCE_CONFIG --config PATH_TO_NEW_LOCAL_CONFIG --managed --dry-run
```

Remove `--dry-run` only when installing the reviewed model dependencies is intended.
The explicit source configuration prevents reliance on the historical `app/`
folder. Existing configured model environments can be reused by path; never copy
or rename a virtual environment. The app requalifies each changed pairing before
ordinary inference. Preparing packages is not model or accuracy verification.

## Integrity, space and interruption

Every package is an exact artifact URL plus SHA-256, including all transitive
runtime dependencies and the source fork. `build.lock` pins setuptools/wheel;
the fork builds with those packages and `--no-build-isolation`. Installation uses
`uv --no-config`, `--require-hashes`, `--no-index` and direct URLs, followed by
`uv pip check`. No stock PyPI ultralytics, training/export extras, system-site
packages, drivers or CUDA Toolkit are installed. If uv needs the pinned Python,
it stores it under the app-owned `.venv-rayguard-python/` directory.

The existing native dependency versions were inspected locally. They are locked
for parity investigation, not claimed to be the newest or universally compatible
versions. The original CPU environment reports base Torch/vision versions without
`+cpu`; switching to explicit official CPU wheels still requires real comparison.

Exact compressed artifact totals from publisher metadata/HEAD (26 September 2026):

| Profile | Bytes including shared dependencies and fork |
|---|---:|
| CPU | 246,048,919 |
| CUDA 12.6 | 2,724,053,903 |
| CUDA 12.8 (disabled) | 3,002,408,938 |

CPU plus CUDA 12.6 has a conservative download upper bound of 2,970,102,822 bytes;
shared cache entries reduce it. The disk preflight for missing/incomplete profiles requires **four times the
compressed total plus 1 GiB** for transfer, unpacked cache, installed copies and
Python/build overhead. This is a conservative estimate, not measured peak usage;
uv/filesystem errors still stop activation. Already-prepared profiles require only
a 1 MiB metadata-write margin. Recheck free space before a retry.

Environments are built once at permanent `.venv-rayguard-<backend>-<lockhash>/`
paths. They are never copied or renamed. Reuse requires the same local ownership
marker/path/lock; failed preparation is marked incomplete and can be retried.
The old app config is preserved until every selected environment passes dependency
checks. Final config replacement is atomic and rejects concurrent config edits.
Ctrl+C, offline downloads and hash failures leave the old config available.
The setup lock prevents concurrent installers. After a hard process crash, inspect
`.venv-rayguard-cache/setup.lock` and remove that file only after confirming the
installer process is no longer running; do not remove a live installer's lock.

Some uv versions omit archive hashes from PEP 610 `direct_url.json` even after
`--require-hashes` succeeds. Setup records `fork_source` (the exact URL and verified
archive hash) in its prepared marker only after installation and dependency checks
complete. It does not rewrite third-party metadata or grant receipts to arbitrary
existing environments. The model probe checks this receipt, permanent path, profile,
lock and actual package versions; the receipt alone is not qualification evidence.

The existing `.venv-yolov10` is never changed. Managed directories and generated
`*.local.json` configs/caches are ignored by Git. Removing an unused managed
environment/cache is a separate user-directed cleanup operation.

## Selection boundaries and maintenance

Hardware discovery uses bounded Windows CIM and `nvidia-smi` queries. It preserves
`CUDA_VISIBLE_DEVICES` and `CUDA_DEVICE_ORDER`. UUID masks can identify physical
GPUs; numeric CUDA ordinals need not match `nvidia-smi` indices, so preflight
conservatively requires wheel coverage across all possible NVIDIA adapters.
The real Torch probe resolves the actual visible ordinal. Driver versions and
architecture capabilities are read, not inferred from the GPU marketing name.

CUDA 12.6 conservatively requires Windows driver 561.17 or later. Its architecture
table accepts native same-major forward compatibility (for example 8.9 from an
8.x cubin), rather than incorrectly demanding every GPU's exact SM number in the
wheel list. Unknown/unsupported capability or an unqualified newer architecture
selects the CPU candidate in `auto`; explicit `cuda:N` fails clearly. CUDA 12.8
has a separate disabled profile with a conservative 572.61 driver floor.

Maintainers can regenerate artifact metadata using
`uv run --locked python environments/resolve_artifacts.py`. This downloads JSON,
index pages and the bounded 1,251,743-byte source archive, never package/model
wheels. Review regenerated URLs, hashes, dependency closure and profile hash
updates before installation. `windows-*.in` documents the inspected pins; an
initial `uv pip compile ... --generate-hashes --python-version 3.11.9
--python-platform windows --torch-backend cpu --no-build` verified dependency
resolution, then exact platform artifacts were selected from publisher metadata.
The resolver does not automatically enable a profile or update its reviewed lock
hash. A dependency/profile change requires fresh runtime qualification.

Official sources inspected:

- [PyTorch 2.9.0 version pairing and backends](https://pytorch.org/get-started/previous-versions/#v290)
- [PyTorch CPU index](https://download.pytorch.org/whl/cpu/torch/),
  [CUDA 12.6 index](https://download.pytorch.org/whl/cu126/torch/),
  [CUDA 12.8 index](https://download.pytorch.org/whl/cu128/torch/)
- [Windows CUDA 12.6 build architectures](https://raw.githubusercontent.com/pytorch/pytorch/v2.9.0/.ci/pytorch/windows/cuda126.bat)
- [CUDA 12.6.3 release notes](https://docs.nvidia.com/cuda/archive/12.6.3/cuda-toolkit-release-notes/index.html)
- [NVIDIA binary compatibility](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html#binary-compatibility)
- [Pinned fork package metadata](https://github.com/THU-MIG/yolov10/blob/453c6e38a51e9d1d5a2aa5fb7f1014a711913397/pyproject.toml)

The pinned source archive SHA-256 is
`ac5262ab1c7f2ad916496cdf6a00cad62cc5d92c2c6254833d9282d26d4e728f`.
