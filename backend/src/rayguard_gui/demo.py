"""Finite read-only replay of local test images through the real session runner."""

import copy
import hashlib
import os
import stat
import threading
from pathlib import Path
from time import monotonic

from fastapi import HTTPException

from .intake import plain_file, signature


def reject(code, message, status=409):
    raise HTTPException(status, detail={"code": code, "message": message})


class DatasetDemo:
    def __init__(self, session):
        self.session = session
        self.settings = session.settings
        self.enabled = False
        self.state = "unconfigured" if self.settings.demo_dir is None else "ready"
        self.catalog = []
        self.root = None
        self.root_identity = None
        self.cursor = 0
        self.batch_total = 0
        self.completed_count = 0
        self.current_name = None
        self.last_run_id = None
        self.confidence = 0.25
        self.error = None
        self.active_index = None
        self.ready_at = 0.0
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self._loop, daemon=True, name="rayguard-demo")
        if self.settings.demo_dir is not None:
            self._load_catalog()

    def start(self):
        self.thread.start()

    def close(self):
        self.stopped.set()
        self.thread.join()

    def _loop(self):
        while not self.stopped.wait(0.25):
            self.tick()

    def fail(self, code, message):
        self.enabled = False
        self.state = "error"
        self.error = {"code": code, "message": message}

    def _check_root(self):
        folder = self.settings.demo_dir
        if folder is None:
            raise OSError("unconfigured")
        # Reject links in the whole configured path, including Windows junctions.
        for part in (folder, *folder.parents):
            info = part.lstat()
            if part.is_symlink() or (
                getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
            ):
                raise OSError("linked directory")
        if not folder.is_dir():
            raise OSError("not a directory")
        root = folder.resolve(strict=True)
        info = root.stat()
        identity = (info.st_dev, info.st_ino)
        if self.root is not None and (root != self.root or identity != self.root_identity):
            raise OSError("source changed")
        self.root, self.root_identity = root, identity

    def _load_catalog(self):
        try:
            self._check_root()
            files = []
            with os.scandir(self.root) as entries:
                for entry in entries:
                    if Path(entry.name).suffix.lower() not in (".png", ".jpg", ".jpeg"):
                        continue
                    path = self.root / entry.name
                    info = plain_file(path, self.root)
                    if info is None:
                        raise OSError("unsupported source entry")
                    files.append((entry.name, signature(info)))
                    if len(files) > 10_000:
                        raise OSError("too many source images")
            self.catalog = sorted(files)
            if not self.catalog:
                self.fail("demo_empty", "No top-level PNG or JPEG images are available for the demo.")
        except OSError:
            self.fail("demo_source_unavailable", "The demo folder is unavailable, changed or unsupported.")

    def snapshot(self):
        with self.session.lock:
            return copy.deepcopy({
                "configured": self.settings.demo_dir is not None,
                "source_label": "IEDXray published test split", "enabled": self.enabled,
                "state": self.state, "total": len(self.catalog), "cursor": self.cursor,
                "next_name": self.catalog[self.cursor][0] if self.cursor < len(self.catalog) else None,
                "current_name": self.current_name, "batch_total": self.batch_total,
                "completed_count": self.completed_count, "last_run_id": self.last_run_id,
                "confidence": self.confidence, "interval_seconds": self.settings.demo_interval_seconds,
                "error": self.error,
            })

    def configure(self, action, start_index=None, count=None, confidence=None):
        with self.session.lock:
            self.session.require_mutable()
            if action == "pause":
                self.enabled = False
                if self.state == "running":
                    self.state = "paused"
                return self.snapshot()
            if self.enabled:
                reject("demo_active", "Pause the current dataset demo before starting another batch.")
            if self.session.intake.enabled or self.session.intake.pending:
                reject("intake_active", "Finish queued folder scans and pause folder intake before the demo.")
            if self.session.active_run_id or self.active_index is not None:
                reject("inference_busy", "Wait for the active scan to finish before starting the demo.")
            if self.settings.demo_dir is None:
                reject("demo_unconfigured", "Configure the local IEDXray test image folder first.", 503)
            if not self.settings.model_status()["configured"]:
                self.fail("model_unconfigured", "Configure the local model before starting the demo.")
                return self.snapshot()
            self.session.runtime.require_ready()
            if action == "resume":
                if self.state != "paused" or self.completed_count >= self.batch_total:
                    reject("demo_not_paused", "Start a new batch; no paused demo batch remains.")
            else:
                if not self.catalog:
                    self._load_catalog()
                    if not self.catalog:
                        return self.snapshot()
                index = self.cursor if start_index is None else start_index
                if index >= len(self.catalog):
                    reject("demo_index_out_of_range", "Choose a starting image within the test split.", 422)
                self.cursor = index
                self.batch_total = min(3 if count is None else count, len(self.catalog) - index)
                self.completed_count = 0
                self.current_name = None
                self.last_run_id = None
                self.confidence = 0.25 if confidence is None else confidence
                self.ready_at = 0.0
            self.enabled = True
            self.state = "running"
            self.error = None
            return self.snapshot()

    def _read_image(self):
        self._check_root()
        name, stamp = self.catalog[self.cursor]
        path = self.root / name
        info = plain_file(path, self.root)
        if info is None or signature(info) != stamp:
            raise OSError("source changed")
        # Bound bytes and verify the opened file before and after reading. No source writes.
        with path.open("rb") as source:
            opened = os.fstat(source.fileno())
            if signature(opened) != stamp or opened.st_dev != info.st_dev:
                raise OSError("source changed during open")
            content = source.read(self.settings.max_upload_bytes + 1)
            if signature(os.fstat(source.fileno())) != stamp:
                raise OSError("source changed during read")
        final = plain_file(path, self.root)
        if final is None or signature(final) != stamp:
            raise OSError("source changed after read")
        return name, content

    def tick(self, current_time=None):
        """A deterministic scheduling step; tests supply a clock and never sleep for playback."""
        with self.session.lock:
            clock = monotonic() if current_time is None else current_time
            if self.active_index is not None:
                run = self.session.runs[self.last_run_id]
                if run["state"] == "running":
                    return
                self.active_index = None
                if run["state"] == "failed":
                    self.fail(run["error"]["code"], run["error"]["message"])
                    return
                self.completed_count += 1
                self.cursor += 1
                self.ready_at = clock + self.settings.demo_interval_seconds
                if self.completed_count == self.batch_total:
                    self.enabled = False
                    self.state = "completed"
            if not self.enabled or clock < self.ready_at:
                return
            try:
                if self.session.active_run_id or self.session.intake.enabled or self.session.intake.pending:
                    reject("inference_busy", "Another input owns the detector. Restart the demo when idle.")
                self.current_name = self.catalog[self.cursor][0]
                name, content = self._read_image()
                scan = self.session.add_scan(content, name, "dataset_demo")
                scan["source"] = {"dataset": "IEDXray", "split": "test", "index": self.cursor}
                scan["source_sha256"] = hashlib.sha256(content).hexdigest()
                run = self.session.start_run(scan["id"], self.confidence)
                self.last_run_id = run["id"]
                self.active_index = self.cursor
            except HTTPException as error:
                self.fail(error.detail["code"], error.detail["message"])
            except OSError:
                self.fail("demo_source_unavailable", "The demo image or source folder changed or is unavailable.")
            except Exception:
                self.fail("demo_error", "The demo stopped unexpectedly. Review the local setup before retrying.")
