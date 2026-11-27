# External data

Datasets are not stored in Git. The app reads scans you upload, a watched export
folder, or a dataset replay folder named in `config.local.json` (`demo_dir`,
`demo_annotations`).

The published source is the [IEDXray dataset](https://doi.org/10.6084/m9.figshare.30784328)
(CC BY 4.0). Preserve its published train/test split. Empty annotations or empty
detections do not mean an image is safe. The dataset audit findings are kept in the
[SDP-I-RayGuard repository](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/iedxray-audit.md).
