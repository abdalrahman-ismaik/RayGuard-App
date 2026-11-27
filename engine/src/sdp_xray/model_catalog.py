"""Inspected task/checkpoint pairings for the original YOLOv10-M adapter.

Model output indices and original COCO IDs are different coordinate systems for
labels. Keep both explicit; never infer them from the order of a detection list.
Artifact inspection does not establish accuracy or runtime qualification.
"""

import hashlib
import json
from dataclasses import dataclass

DEFAULT_MODEL_ID = "author-yolov10m-generic"


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    task: str
    kind: str
    classes: tuple[str, ...]
    coco_ids: tuple[int, ...]
    filename: str
    sha256: str
    description: str
    family: str = "YOLOv10-M"

    @property
    def names(self):
        return dict(enumerate(self.classes))

    @property
    def source_category_map(self):
        return {str(key): name for key, name in zip(self.coco_ids, self.classes, strict=True)}

    @property
    def class_map_sha256(self):
        mapping = {"task": self.task, "kind": self.kind, "model_names": self.names,
                   "source_category_map": self.source_category_map}
        return hashlib.sha256(json.dumps(mapping, sort_keys=True).encode()).hexdigest()

    def public(self):
        return {"id": self.id, "label": self.label, "family": self.family,
                "task": self.task, "kind": self.kind, "classes": list(self.classes),
                "description": self.description}


MODELS = {spec.id: spec for spec in (
    ModelSpec(
        DEFAULT_MODEL_ID, "YOLOv10-M · Generic Explosive",
        "iedxray.generic_explosive_detection", "suspicious_region", ("Explosive",), (0,),
        "yolov10_generic_exp.pt",
        "b484d9a6fb37236f6adcc8c019e6a836f11901dc53a0f71d6cce7262413287ff",
        "Locates suspicious explosive regions using one trained class. Empty output is not a safety verdict.",
    ),
    ModelSpec(
        "author-yolov10m-generic-tuned", "YOLOv10-M · Generic Explosive (fine-tuned)",
        "iedxray.generic_explosive_detection", "suspicious_region", ("Explosive",), (0,),
        "epoch-084.pt",
        "097ff71eb741ce51ba053bc77512ba0916772c69ae8b4d7d50c0ef497e3f65f8",
        "Fine-tuned on IEDXray in the SDP I study (job 819, epoch 84). "
        "Locates suspicious explosive regions using one trained class. Empty output is not a safety verdict.",
    ),
    ModelSpec(
        "author-yolov10m-device", "YOLOv10-M · Electronic Devices",
        "iedxray.device_detection", "device",
        ("Laptop", "Mobile", "Pager", "Walkie-Talkie"), (1, 2, 3, 4),
        "yolov10_device_detection.pt",
        "8106dc79234473def8335e863585623f2c0de17e57a6b6c0a7d1c61bf2691f2d",
        "Locates electronic devices; device presence does not establish an explosive threat. "
        "Stored Mobile/Pager labels are preserved; source annotation disagreements remain unresolved.",
    ),
    ModelSpec(
        "author-yolov10m-specific", "YOLOv10-M · Specific Explosives",
        "iedxray.specific_explosive_detection", "suspicious_region",
        ("IED Explosive", "Laptop Explosive", "Mobile Phone Explosive", "Pager Explosive",
         "Walkie-Talkie Explosive"), (1, 2, 3, 4, 5),
        "yolov10_specific_exp.pt",
        "4464ad8a9c02d550b79fe616ea1c39869f5f9c2e604025ef3dd9de4f544f0172",
        "Locates suspicious explosive regions with five trained labels. "
        "These are region labels, not a whole-device safety classification.",
    ),
)}


def get_model(model_id: str) -> ModelSpec:
    if not isinstance(model_id, str) or model_id not in MODELS:
        raise ValueError("Choose a supported model from the RayGuard catalog.")
    return MODELS[model_id]


UNVERIFIED_FAMILIES = tuple({
    "id": model_id, "label": family, "family": family, "task": None, "kind": None,
    "classes": [], "description": "Historical artifact inspection only; classes and runtime are not verified for this app.",
    "selectable": False, "reason": reason,
} for model_id, family, reason in (
    ("unverified-ao-detr", "AO-DETR", "Unavailable: custom backend and task mapping require verification; no configured checkpoint."),
    ("unverified-cascade-rcnn", "Cascade R-CNN", "Unavailable: MMDetection backend and task mapping require verification; no configured checkpoint."),
    ("unverified-faster-rcnn", "Faster R-CNN", "Unavailable: backend verification pending; the inspected specific checkpoint has inconsistent class/head counts."),
    ("unverified-detr", "DETR", "Unavailable: trained model-index/category mapping is unresolved; no verified backend."),
    ("unverified-grounding-dino", "Grounding DINO", "Unavailable: prompt/category mapping and local language assets require verification."),
))
