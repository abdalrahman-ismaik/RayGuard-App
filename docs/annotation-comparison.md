# IEDXray test annotation comparison

The user requested the real test-set reference beside the model result, so a
completed inference can be distinguished from a successful detection. This is a
**per-image comparison with the supplied generic annotations**, not a claim of
overall accuracy or operational clearance. The project chose a fixed **IoU ≥ 0.50**
diagnostic rule. No advisor-specified acceptance threshold was supplied.

With the model selector, this adapter remains limited to **Generic Explosive**.
Device and Specific Explosives runs explicitly report comparison unavailable
before loading any generic GT. They need independently verified task-specific
annotation adapters; model qualification itself does not use ground truth.

## Reference and eligibility

Configure `demo_annotations` alongside `demo_dir` in ignored `config.local.json`:

```json
{
  "demo_dir": "data/IEDXray/Test",
  "demo_annotations": "data/IEDXray/annotations/binary_explosive_det_test.json"
}
```

Restart the service to load these settings. Relative paths use the config file's
folder. Missing/invalid references disable comparison only; upload and inference
remain available. Annotation changes after startup require a verified pairing and
restart. This feature neither downloads data nor feeds annotations into inference.

The inspected generic test source on 26 September 2026 has SHA-256
`1aad3787ba4964456e58bc07366dfcc6ce29db8a6ca06cc5c377a2add8d8ca43`,
5,136 image rows, 3,204 boxes and 1,932 annotation-empty images. Its original
category ID is **0 → Explosive**, mapped explicitly to the existing
`iedxray.generic_explosive_detection` result namespace. These are inspected release
facts, not invented IDs or a different device/specific taxonomy.

Only recorded IEDXray **test replay** runs are eligible. The service:

1. Joins the exact filename to the COCO image table. It never derives the image ID
   from the filename: 532 inspected IDs differ from their filename suffixes.
2. Validates unique identities, category 0, image references and finite, positive,
   in-bounds boxes. Crowd/ignore annotations are unsupported and fail closed.
3. Verifies the original source JPEG SHA-256 against the saved run, re-normalizes
   it with the existing input routine and verifies the canonical PNG hash,
   dimensions and saved PNG bytes. EXIF rotations needing annotation transforms
   are unsupported. All inspected test JPEG headers matched the annotation sizes
   and lacked an orientation tag.
4. Validates the saved result's image, run, model, task, checkpoint provenance,
   category namespace and captured confidence threshold before evaluating it.

Ordinary uploads and folder scans lack this verified replay provenance. Filename
similarity alone does not grant them reference labels. Failed/running detector
runs can show verified reference boxes, but receive no detection verdict.

## Display and matching

COCO boxes use original-pixel `[x, y, width, height]`. The comparison converts them
to continuous `[x_min, y_min, x_max, y_max]` with no clipping or inclusive-pixel
`+1`. Reference and prediction layers share the image's pan/zoom transform; image
adjustments never change coordinates, predictions or source bytes.

- **Dashed cyan / GT**: published reference boxes; an independent toggle hides them.
- **Solid amber**: actual saved model detections with their own overlay control.
- **Findings**: annotated, matched, missed and extra counts, IoU rule and the saved
  run's confidence threshold. Reference & limits exposes provenance and caveats.

Predictions are considered in descending confidence, with detection-ID tie breaks.
Each selects the highest-IoU unmatched reference of the same class, with annotation-ID
tie breaks. A match requires IoU ≥ 0.50; every prediction/reference participates at
most once. Remaining annotations are missed; remaining predictions are extra.

| Display | Meaning for this image and threshold |
|---|---|
| Matched annotations | All nonempty references and predictions matched |
| Missed target | At least one unmatched reference; no extra prediction |
| Extra detection | At least one unmatched prediction; no missed reference |
| Mixed result | Both missed references and extra predictions |
| No annotated targets | No reference boxes and no predictions; not automatic success |
| Not evaluated | Reference unavailable, request failed, or result not comparable |

This is a small diagnostic matcher. The
[official COCO evaluator](https://github.com/cocodataset/cocoapi/blob/master/PythonAPI/pycocotools/cocoeval.py)
also handles multiple IoU thresholds, recall aggregation, area ranges, ignore/crowd
rules and detection limits. This interface does **not** calculate COCO AP/AP50/AR,
full-test accuracy or a calibrated threat probability. Do not tune the threshold
or select favorable examples from test results.

## API and export

`GET /api/runs/{id}/comparison` returns
`rayguard.annotation-comparison.v1`: run/task identity, availability/reason,
annotation basename/hash/split, original image ID/hash, reference `box_xyxy` values,
matching counts/IDs/IoUs and warnings. `available` means verified reference data;
`evaluation` can still be null. `image_sha256` identifies the **original source**,
whereas `run.scan.sha256` identifies the canonical model-input PNG.

The existing run export includes the same object as `annotation_comparison`.
It does not replace or edit the saved prediction contract. Private paths, source
scans and annotation files stay outside Git and are not embedded in the export.
The client discards late responses when the selected run changes.

## Limitations and evidence

The supplied release has confirmed train/test byte duplicates and unresolved
physical grouping. `Test000071.jpg` has no generic region despite a Modified Pager
label in the complete annotations. Therefore an empty reference is not proof of
benignness. See the [audit](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/iedxray-audit.md) and
[paper review](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/iedxray-paper-review.md).

Software tests use synthetic boxes and responses. Comparisons against genuine
saved inference are recorded separately in [progress](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/progress.md).
This feature does not complete device detection, full P1 decisions, P2 fusion,
full-test evaluation or human showcase acceptance.
