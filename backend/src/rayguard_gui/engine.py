"""Check the bundled inference engine before setup or starting the local service."""

import importlib.util
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[3]
REPOSITORY = APP_ROOT / "engine"
RESTORE = "Restore it with git checkout -- engine, or clone the RayGuard App again."
REQUIRED = ("pyproject.toml", "src/sdp_xray/model_catalog.py",
            "scripts/infer_generic_yolov10.py", "scripts/setup_model_runtime.py",
            "environments/profiles.json")


def verify_engine():
    """The engine ships in this repository; confirm it is complete and installed from here."""
    if not all((REPOSITORY / name).is_file() for name in REQUIRED):
        raise ValueError(f"The app's engine folder is missing or incomplete. {RESTORE}")
    installed = importlib.util.find_spec("sdp_xray")
    if (installed is None or installed.origin is None
            or Path(installed.origin).resolve().parent != REPOSITORY / "src/sdp_xray"):
        raise ValueError("The installed sdp-rayguard package is not this checkout's engine. "
                         "Run uv sync --project backend --locked from the app checkout.")
    return str(REPOSITORY)


if __name__ == "__main__":
    try:
        print(f"Bundled engine verified: {verify_engine()}")
    except ValueError as error:
        raise SystemExit(str(error)) from error
