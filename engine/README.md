# RayGuard inference engine

This folder is the inference engine of the RayGuard App. It is part of this
repository; no other checkout is needed to run the app.

It was copied on 27 November 2026 from the
[SDP-I-RayGuard](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard) research
repository (engine revision `b7ec59e`, plus the tuned-model catalogue entry from
`83961d2`). That repository keeps the research history, datasets audit, training study
and team records. Changes to the app's engine are now made here.

| Path | Contents |
|---|---|
| `src/sdp_xray/model_catalog.py` | The models the app can select, with their classes and checkpoint SHA-256 |
| `src/sdp_xray/common/contracts.py` | Scan-result JSON contract checked on every run |
| `src/sdp_xray/model_runtime.py`, `runtime_setup.py` | Isolated model runtime checks and managed setup |
| `scripts/infer_generic_yolov10.py` | The inference run the app starts for each scan |
| `scripts/setup_model_runtime.py` | Prepares the isolated CPU/NVIDIA model environment |
| `environments/` | Locked model-environment profiles (CPU, CUDA 12.6, CUDA 12.8) |
| `tests/` | Engine tests (synthetic data only) |

Check the engine from the app root:

```powershell
uv run --project engine --locked ruff check engine
uv run --project engine --locked python -m pytest engine/tests
```

Weights and datasets are not stored in Git. See [models/README.md](models/README.md)
for how to get the tuned checkpoint.
