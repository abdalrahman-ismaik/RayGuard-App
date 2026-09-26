"""Bounded local uploads, one active inference job, and session-scoped history."""

import copy
import hashlib
import json
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from time import perf_counter
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sdp_xray.model_catalog import get_model
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .comparison import AnnotationComparison
from .config import APP_ROOT, Settings
from .demo import DatasetDemo
from .images import normalize_image
from .intake import FolderIntake
from .runner import (
    InferenceFailure,
    InferenceOutput,
    SubprocessRunner,
    validate_execution,
    validate_prediction,
)
from .runtime import RuntimeController


def now() -> str:
    return datetime.now(UTC).isoformat()


def problem(status: int, code: str, message: str):
    raise HTTPException(status, detail={"code": code, "message": message})


def export_model_scope(run):
    """Describe the recorded run, including exports predating the outer model snapshot."""
    model = run.get("model") or (run.get("result") or {}).get("model") or {}
    scope = "Recorded model identity is unavailable or unrecognized; task-specific scope cannot be established."
    try:
        spec = get_model(model.get("id"))
        if model.get("task") == spec.task:
            scope = {
                "iedxray.generic_explosive_detection": "Generic explosive localization only.",
                "iedxray.device_detection": "Electronic-device localization only; device presence does not establish an explosive threat.",
                "iedxray.specific_explosive_detection": "Class-specific suspicious-region localization only; these labels are not a whole-device safety classification.",
            }[spec.task]
    except (AttributeError, KeyError, ValueError):
        pass
    return f"{scope} Full P1/P2 are not implemented."


class LocalRequestBoundary:
    """Bound the complete multipart body before parsing; reject remote browser mutations."""

    def __init__(self, app, maximum: int):
        self.app = app
        self.maximum = maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH", "DELETE"):
            return await self.app(scope, receive, send)
        headers = {key.decode("latin-1").lower(): value.decode("latin-1")
                   for key, value in scope["headers"]}
        try:
            origin = urlparse(headers.get("origin", ""))
        except ValueError:
            origin = urlparse("invalid:")
        if headers.get("sec-fetch-site") == "cross-site" or (
            headers.get("origin") and (
                origin.scheme != "http" or origin.hostname not in ("localhost", "127.0.0.1")
            )
        ):
            response = JSONResponse(
                {"detail": {"code": "origin_rejected", "message": "Use the local application."}},
                status_code=403,
            )
            return await response(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.maximum:
                response = JSONResponse(
                    {"detail": {"code": "upload_too_large", "message": "Upload exceeds the limit."}},
                    status_code=413,
                )
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break

        async def bounded_receive():
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, bounded_receive, send)


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scan_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    confidence: float = Field(ge=0.01, le=1, allow_inf_nan=False, strict=True)


class IntakeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(strict=True)
    confidence: float = Field(ge=0.01, le=1, allow_inf_nan=False, strict=True)


class DemoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["start", "pause", "resume"]
    start_index: int | None = Field(default=None, ge=0, strict=True)
    count: int | None = Field(default=None, ge=1, le=20, strict=True)
    confidence: float | None = Field(default=None, ge=0.01, le=1,
                                     allow_inf_nan=False, strict=True)


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["unreviewed", "reviewed", "follow_up"]
    note: str = Field(max_length=1000, strict=True)


class RuntimeVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scan_id: str = Field(pattern=r"^[a-f0-9]{32}$")


class RuntimeDeviceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    device: str = Field(pattern=r"^(cpu|cuda:(0|[1-9][0-9]{0,2}))$", strict=True)
    service_instance_id: str = Field(pattern=r"^[a-f0-9]{32}$", strict=True)
    restart: bool = Field(strict=True)


class RuntimeSelectionRequest(RuntimeDeviceRequest):
    model_id: str = Field(min_length=1, max_length=80, strict=True)


class Session:
    def __init__(self, settings: Settings, runner, policy_store=None, restart_callback=None):
        self.settings = settings
        self.runner = runner
        self.policy_store, self.restart_callback = policy_store, restart_callback
        self.restarting = False
        if settings.demo_dir and settings.storage_dir.resolve().is_relative_to(
            settings.demo_dir.resolve()
        ):
            raise ValueError("GUI storage must be outside the demo source directory")
        self.directory = settings.storage_dir / uuid4().hex
        self.directory.mkdir(parents=True, exist_ok=False)
        self.scans: dict[str, dict] = {}
        self.runs: dict[str, dict] = {}
        self.runtime_requests: dict[str, dict] = {}
        self.active_run_id: str | None = None
        self.lock = threading.RLock()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rayguard-inference")
        self.intake = FolderIntake(self)
        self.demo = DatasetDemo(self)
        self.comparison = AnnotationComparison(settings)
        self.runtime = RuntimeController(self)

    def require_mutable(self):
        if self.restarting:
            problem(409, "service_restarting", "The service is restarting. Wait for the new session.")

    def check_storage(self, incoming: int = 0):
        total = sum(path.stat().st_size for path in self.settings.storage_dir.rglob("*")
                    if path.is_file())
        if total + incoming > self.settings.max_storage_bytes:
            problem(507, "storage_full", "Local storage limit reached. Review saved runs before retrying.")

    def add_scan(self, content: bytes, filename: str, origin: str):
        name, width, height, pixels = normalize_image(
            content, filename, self.settings, folder=origin == "folder",
        )
        scan_id = uuid4().hex
        scan = {
            "id": scan_id, "name": name, "width": width, "height": height,
            "sha256": hashlib.sha256(pixels).hexdigest(),
            "image_url": f"/api/scans/{scan_id}/image",
            "origin": origin, "received_at": now(),
        }
        with self.lock:
            self.require_mutable()
            if len(self.scans) >= self.settings.max_scans:
                problem(409, "session_limit", "Session scan limit reached. Restart to begin a new session.")
            self.check_storage(len(pixels))
            try:
                (self.directory / f"{scan_id}.png").write_bytes(pixels)
            except OSError:
                problem(507, "storage_error", "Could not save the image to local storage.")
            self.scans[scan_id] = scan
        return scan

    def start_run(self, scan_id: str, confidence: float, run_id: str | None = None):
        with self.lock:
            self.require_mutable()
            if not self.settings.model_status()["configured"]:
                problem(503, "model_unconfigured", "Configure the local model before running inference.")
            self.runtime.require_ready()
            if scan_id not in self.scans:
                problem(404, "scan_not_found", "Select an image from the current session.")
            if self.active_run_id:
                problem(409, "inference_busy", "A scan is already running. Wait for it to finish.")
            if len(self.runs) >= self.settings.max_runs:
                problem(409, "session_limit", "Session run limit reached. Restart to begin a new session.")
            self.check_storage()
            run_id = run_id or uuid4().hex
            run = {
                "id": run_id, "scan_id": scan_id, "scan": self.scans[scan_id],
                "state": "running", "created_at": now(), "completed_at": None,
                "confidence": confidence, "elapsed_seconds": None, "result": None,
                "error": None, "review": {"status": "unreviewed", "note": "", "updated_at": None},
                "execution_request": self.runtime.request_record(),
                "model": self.settings.model_record(),
            }
            try:
                private_request = self.runtime.private_request()
            except (OSError, ValueError):
                self.runtime.on_run_failure({"code": "runtime_changed", "message":
                                             "Execution settings became unavailable. Review setup and restart."})
                problem(503, "runtime_changed", "Execution settings became unavailable. Review setup and restart.")
            self.runs[run_id] = run
            self.runtime_requests[run_id] = private_request
            self.active_run_id = run_id
            self.pool.submit(self.perform, run_id)
            return copy.deepcopy(run)

    def save_run(self, run):
        target = self.directory / f"{run['id']}.json"
        temporary = target.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(run, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        temporary.replace(target)

    def get_run(self, run_id: str) -> dict:
        with self.lock:
            if run_id not in self.runs:
                problem(404, "run_not_found", "This run is not in the current session.")
            return copy.deepcopy(self.runs[run_id])

    def perform(self, run_id: str):
        started = perf_counter()
        run = self.get_run(run_id)
        output = self.directory / run_id
        try:
            with self.lock:
                private_request = self.runtime_requests.pop(run_id)
            try:
                (self.directory / f"{run_id}.request.json").write_text(
                    json.dumps(private_request, indent=2, allow_nan=False), encoding="utf-8",
                )
            except OSError as error:
                raise InferenceFailure("storage_error", "Could not save execution settings.") from error
            observed = self.runner(
                self.directory / f"{run['scan_id']}.png", output, run["confidence"]
            )
            # Existing explicitly injected software-test runners have no hardware evidence.
            result = observed.prediction if isinstance(observed, InferenceOutput) else observed
            validate_prediction(result, run["scan"], run, self.settings)
            run.update(state="succeeded", result=result)
            if isinstance(observed, InferenceOutput) and observed.execution is not None:
                validate_execution(observed.execution, run["execution_request"]["device"])
                run["execution"] = self.runtime.execution_record(observed.execution)
        except Exception as error:
            failure = error if isinstance(error, InferenceFailure) else InferenceFailure(
                "invalid_output", "Inference returned an invalid result. Check the local run log."
            )
            run.update(state="failed", result=None,
                       error={"code": failure.code, "message": failure.message})
            # Even failed diagnostic writes must release the worker and show a failure.
            # Stack traces and paths stay local, never in a browser error.
            try:
                (self.directory / f"{run_id}.error.log").write_text(
                    traceback.format_exc(), encoding="utf-8"
                )
            except OSError:
                pass
        finally:
            run.update(completed_at=now(), elapsed_seconds=perf_counter() - started)
            # The evidence survives a restart; browser history intentionally does not.
            try:
                self.save_run(run)
            except OSError:
                run.update(state="failed", result=None,
                           error={"code": "storage_error", "message": "Could not save run evidence."})
            with self.lock:
                self.runs[run_id] = run
                if run["state"] == "failed":
                    self.runtime.on_run_failure(run["error"])
                self.active_run_id = None


def create_app(settings: Settings | None = None, runner=None, *, policy_store=None,
               restart_callback=None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        session = Session(settings, runner or SubprocessRunner(settings), policy_store, restart_callback)
        app.state.session = session
        session.runtime.start()
        session.intake.start()
        session.demo.start()
        try:
            yield
        finally:
            session.intake.close()
            session.demo.close()
            session.pool.shutdown(wait=True)

    app = FastAPI(title="RayGuard local workspace", lifespan=lifespan,
                  docs_url=None, redoc_url=None)
    app.add_middleware(LocalRequestBoundary, maximum=settings.max_upload_bytes + 65536)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError):
        # Do not echo arbitrary input (including JSON NaN/Infinity) into errors.
        return JSONResponse(
            {"detail": {"code": "invalid_request",
                        "message": "Check the request fields and use a confidence from 0.01 to 1."}},
            status_code=422,
        )

    @app.middleware("http")
    async def private_responses(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health(request: Request):
        session = request.app.state.session
        return {
            "status": "ok", "model": settings.model_status(),
            "service_instance_id": session.directory.name,
            "limits": {"max_upload_bytes": settings.max_upload_bytes,
                       "max_pixels": settings.max_pixels, "max_scans": settings.max_scans,
                       "max_runs": settings.max_runs},
            "active_run_id": session.active_run_id,
            "runtime": session.runtime.snapshot(),
        }

    @app.post("/api/runtime/verify", status_code=202)
    def verify_runtime(body: RuntimeVerifyRequest, request: Request):
        return request.app.state.session.runtime.verify(body.scan_id)

    @app.post("/api/runtime/device")
    def change_runtime_device(body: RuntimeDeviceRequest, request: Request, background: BackgroundTasks):
        session = request.app.state.session
        result = session.runtime.change_device(body.device, body.service_instance_id, body.restart)
        if body.restart:
            background.add_task(session.restart_callback)
        return JSONResponse(result, status_code=202 if body.restart else 200, background=background)

    @app.post("/api/runtime/selection")
    def change_runtime_selection(body: RuntimeSelectionRequest, request: Request, background: BackgroundTasks):
        session = request.app.state.session
        result = session.runtime.change_selection(body.model_id, body.device, body.service_instance_id, body.restart)
        if body.restart:
            background.add_task(session.restart_callback)
        return JSONResponse(result, status_code=202 if body.restart else 200, background=background)

    @app.get("/api/intake")
    def intake_status(request: Request):
        return request.app.state.session.intake.snapshot()

    @app.post("/api/intake")
    def intake_control(body: IntakeRequest, request: Request):
        return request.app.state.session.intake.configure(body.enabled, body.confidence)

    @app.get("/api/demo")
    def demo_status(request: Request):
        return request.app.state.session.demo.snapshot()

    @app.post("/api/demo")
    def demo_control(body: DemoRequest, request: Request):
        if body.action != "start" and body.model_fields_set - {"action"}:
            problem(422, "invalid_request", "Only Start accepts a position, count or confidence.")
        return request.app.state.session.demo.configure(
            body.action, body.start_index, body.count, body.confidence,
        )

    @app.post("/api/scans", status_code=201)
    def upload(request: Request, file: UploadFile):
        session = request.app.state.session
        content = file.file.read(settings.max_upload_bytes + 1)
        return session.add_scan(content, file.filename or "scan", "upload")

    @app.get("/api/scans/{scan_id}/image")
    def scan_image(scan_id: str, request: Request):
        session = request.app.state.session
        if scan_id not in session.scans:
            problem(404, "scan_not_found", "This image is not in the current session.")
        return FileResponse(session.directory / f"{scan_id}.png", media_type="image/png")

    @app.post("/api/runs", status_code=202)
    def start_run(body: RunRequest, request: Request):
        session = request.app.state.session
        with session.lock:
            if session.demo.enabled:
                problem(409, "demo_active", "Pause the dataset demo before starting a manual run.")
            if session.intake.enabled:
                problem(409, "intake_active", "Pause incoming images before starting a manual run.")
            return session.start_run(body.scan_id, body.confidence)

    @app.get("/api/runs")
    def list_runs(request: Request):
        session = request.app.state.session
        with session.lock:
            return {"items": copy.deepcopy(list(reversed(session.runs.values())))}

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, request: Request):
        return request.app.state.session.get_run(run_id)

    @app.get("/api/runs/{run_id}/comparison")
    def compare_run(run_id: str, request: Request):
        session = request.app.state.session
        return session.comparison.compare(session.get_run(run_id), session)

    @app.patch("/api/runs/{run_id}/review")
    def review_run(run_id: str, body: ReviewRequest, request: Request):
        session = request.app.state.session
        with session.lock:
            session.require_mutable()
            run = session.get_run(run_id)
            if run["state"] == "running":
                problem(409, "run_incomplete", "Wait until inference finishes before recording review.")
            run["review"] = {"status": body.status, "note": body.note, "updated_at": now()}
            try:
                session.save_run(run)
            except OSError:
                problem(507, "storage_error", "Could not save review. The previous review is unchanged.")
            session.runs[run_id] = run
            return copy.deepcopy(run)

    @app.get("/api/runs/{run_id}/export")
    def export_run(run_id: str, request: Request):
        session = request.app.state.session
        run = session.get_run(run_id)
        if run["state"] == "running":
            problem(409, "run_incomplete", "Wait until the run has finished before exporting.")
        return JSONResponse(
            {"schema_version": "rayguard.gui.export.v1", "run": run,
             "annotation_comparison": session.comparison.compare(run, session),
             "limitations": ["Research prototype; no benign or safety verdict.",
                             export_model_scope(run),
                             "Elapsed time includes process/model startup; it is not model FPS."]},
            headers={"Content-Disposition": f'attachment; filename="rayguard-{run_id}.json"'},
        )

    frontend = APP_ROOT / "frontend" / "dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app
