"""Read-only folder intake; a software adapter, never a scanner control interface."""

import copy
import os
import stat
import threading
from collections import deque
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic
from uuid import uuid4

from fastapi import HTTPException


def timestamp():
    return datetime.now(UTC).isoformat()


def signature(info):
    return info.st_size, info.st_mtime_ns, info.st_ino


def plain_file(path: Path, root: Path):
    """Reject reparse points and links, and keep reads within the configured directory."""
    info = path.lstat()
    if (
        not stat.S_ISREG(info.st_mode)
        or path.is_symlink()
        or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
        or path.resolve().parent != root
    ):
        return None
    return info


class FolderIntake:
    def __init__(self, session):
        self.session = session
        self.settings = session.settings
        self.enabled = False
        self.initialized = False
        self.root: Path | None = None
        self.confidence = 0.25
        self.pending = deque()
        self.issues = deque(maxlen=20)
        self.seen = {}
        self.candidates = {}
        self.received_count = 0
        self.last_received_at = None
        self.error = None
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self._loop, daemon=True, name="rayguard-intake")

    def start(self):
        self.thread.start()

    def close(self):
        self.stopped.set()
        self.thread.join()

    def _loop(self):
        while not self.stopped.wait(1):
            self.tick()

    def snapshot(self):
        with self.session.lock:
            configured = self.settings.incoming_dir is not None
            state = "unconfigured" if not configured else "paused"
            if self.error:
                state = "backpressure" if self.enabled and self.error["code"] == "queue_full" else "error"
            elif self.enabled:
                state = "receiving" if self.session.active_run_id or self.pending else "waiting"
            return copy.deepcopy({
                "configured": configured, "enabled": self.enabled, "state": state,
                "adapter": "folder", "hardware_verified": False,
                "source_label": self.settings.source_label, "confidence": self.confidence,
                "pending_count": len(self.pending), "received_count": self.received_count,
                "last_received_at": self.last_received_at, "error": self.error,
                "pending": [{"id": item["id"], "scan": item["scan"], "state": "queued"}
                            for item in self.pending],
                "issues": list(reversed(self.issues)),
            })

    def fail(self, code, message):
        self.enabled = False
        self.error = {"code": code, "message": message}

    def _files(self):
        folder = self.settings.incoming_dir
        if (
            folder is None or not folder.is_dir() or folder.is_symlink()
            or getattr(folder.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
        ):
            raise OSError("source unavailable")
        root = folder.resolve(strict=True)
        if self.root is not None and root != self.root:
            raise OSError("source changed")
        self.root = root
        files = {}
        # Never recurse or decode history. Bound baseline metadata as well as the queue.
        with os.scandir(root) as entries:
            for entry in entries:
                if Path(entry.name).suffix.lower() not in (".png", ".jpg", ".jpeg", ".bmp"):
                    continue
                path = root / entry.name
                try:
                    info = plain_file(path, root)
                except FileNotFoundError:
                    continue
                if info is not None:
                    files[entry.name] = signature(info)
                    if len(files) > 10_000:
                        raise OSError("source directory too large")
        return files

    def configure(self, enabled: bool, confidence: float):
        with self.session.lock:
            self.session.require_mutable()
            if enabled and self.session.demo.enabled:
                raise HTTPException(409, detail={
                    "code": "demo_active", "message": "Pause the dataset demo before receiving exports.",
                })
            self.confidence = confidence
            if not enabled:
                self.enabled = False
                self.error = None
                return self.snapshot()
            if self.settings.incoming_dir is None:
                self.fail("source_unconfigured", "Configure an incoming export folder first.")
                return self.snapshot()
            if not self.settings.model_status()["configured"]:
                self.fail("model_unconfigured", "Configure the local model before receiving images.")
                return self.snapshot()
            self.session.runtime.require_ready()
            if not self.enabled:
                try:
                    files = self._files()
                except OSError:
                    self.fail("source_unavailable", "The export folder is unavailable or unsupported.")
                    return self.snapshot()
                # Only first start skips history. Pausing this app does not stop a scanner:
                # exports that accumulate while paused must still be discovered on resume.
                if not self.initialized:
                    self.seen = files
                    self.initialized = True
            self.enabled = True
            self.error = None
            return self.snapshot()

    def _dispatch(self):
        if self.pending and not self.session.active_run_id:
            item = self.pending[0]
            self.session.start_run(item["scan"]["id"], item["confidence"], item["id"])
            self.pending.popleft()

    def tick(self, current_time: float | None = None):
        """One deterministic poll; tests advance this directly without sleeping."""
        with self.session.lock:
            if not self.enabled or self.session.demo.enabled:
                return
            clock = monotonic() if current_time is None else current_time
            try:
                files = self._files()
                self._dispatch()
                self.error = None
                self.candidates = {name: item for name, item in self.candidates.items()
                                   if name in files}
                self.seen = {name: stamp for name, stamp in self.seen.items() if name in files}
                for name, stamp in files.items():
                    if self.seen.get(name) == stamp:
                        continue
                    previous = self.candidates.get(name)
                    if previous is None or previous[0] != stamp:
                        self.candidates[name] = (stamp, clock)
                for name, (stamp, observed_at) in list(self.candidates.items()):
                    if clock - observed_at < self.settings.settle_seconds:
                        continue
                    if len(self.pending) >= self.settings.max_pending:
                        self.error = {
                            "code": "queue_full",
                            "message": "Incoming queue is full. Accepted scans keep processing; new exports wait in the source folder.",
                        }
                        break
                    self._accept(name, stamp)
                self._dispatch()
            except HTTPException as error:
                self.fail(error.detail["code"], error.detail["message"])
            except OSError:
                self.fail("source_unavailable", "The export folder or local storage is unavailable.")
            except Exception:
                self.fail("intake_error", "The receiver stopped unexpectedly. Review local setup and retry.")

    def _accept(self, name, stamp):
        path = self.root / name
        info = plain_file(path, self.root)
        if info is None or signature(info) != stamp:
            return  # Writer or rename is still active; observe again on the next poll.
        with path.open("rb") as source:
            opened = os.fstat(source.fileno())
            if signature(opened) != stamp or path.resolve().parent != self.root:
                return
            content = source.read(self.settings.max_upload_bytes + 1)
            if signature(os.fstat(source.fileno())) != stamp:
                return
        final = plain_file(path, self.root)
        if final is None or signature(final) != stamp:
            return
        try:
            scan = self.session.add_scan(content, name, "folder")
        except HTTPException as error:
            if error.detail["code"] not in (
                "invalid_image", "unsupported_format", "animated_image",
                "too_many_pixels", "upload_too_large",
            ):
                raise
            self.issues.append({"id": uuid4().hex, "name": name[:160],
                                **error.detail, "occurred_at": timestamp()})
        else:
            self.pending.append({"id": uuid4().hex, "scan": scan,
                                 "confidence": self.confidence})
            self.received_count += 1
            self.last_received_at = scan["received_at"]
        self.seen[name] = stamp
        del self.candidates[name]
