# Model checkpoints

Checkpoints are not stored in Git. Each model in
[model_catalog.py](../src/sdp_xray/model_catalog.py) is bound to one file by SHA-256;
the app refuses any other file for that model.

| Catalogue ID | File | Where to get it |
|---|---|---|
| `author-yolov10m-generic-tuned` | `epoch-084.pt` | [RayGuard-App release `tuned-model-v1`](https://github.com/abdalrahman-ismaik/RayGuard-App/releases/tag/tuned-model-v1), or `scripts/get-tuned-model.ps1` from the app root |
| `author-yolov10m-generic` | `yolov10_generic_exp.pt` | IEDXray authors ([author code](https://github.com/Natnael-gh/IEDXray)); not redistributed here |
| `author-yolov10m-device` | `yolov10_device_detection.pt` | IEDXray authors; not redistributed here |
| `author-yolov10m-specific` | `yolov10_specific_exp.pt` | IEDXray authors; not redistributed here |

All four are native THU-MIG YOLOv10 checkpoints. They run with the pinned fork
(commit `453c6e38a51e9d1d5a2aa5fb7f1014a711913397`) in the isolated model environment
from `../environments/`. The inference script allows full-object loading only for the
exact file and hash selected; it never changes a checkpoint.

The tuned model was fine-tuned on the IEDXray dataset
([CC BY 4.0](https://doi.org/10.6084/m9.figshare.30784328); Takele et al.,
[paper](https://doi.org/10.1038/s41597-026-07263-7)). Empty output from any model is
not a safety verdict.
