"""Check the source dependency before setup or starting the local service."""

import importlib.util
import os
import re
import subprocess
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[3]
REPOSITORY = APP_ROOT / "engine"
INITIALIZE = "Run git submodule update --init --recursive from the RayGuard App checkout."


def verify_engine():
    required = ("pyproject.toml", "src/sdp_xray/model_catalog.py",
                "scripts/infer_generic_yolov10.py", "scripts/setup_model_runtime.py",
                "environments/profiles.json")
    if not all((REPOSITORY / name).is_file() for name in required):
        raise ValueError(f"The pinned engine submodule is missing or incomplete. {INITIALIZE}")

    def git(*arguments):
        try:
            result = subprocess.run(
                ["git", *arguments], capture_output=True, text=True, check=True,
                stdin=subprocess.DEVNULL, timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise ValueError("Cannot verify the engine pin. Install Git and use a checkout "
                             "cloned with --recurse-submodules.") from error
        return result.stdout

    record = git("-C", str(APP_ROOT), "ls-files", "--stage", "--", "engine").strip()
    match = re.fullmatch(r"160000 ([0-9a-f]{40}) 0\tengine", record)
    if match is None:
        raise ValueError("The app checkout has no unambiguous engine gitlink pin. "
                         "Use a Git clone with --recurse-submodules.")
    revision = git("-C", str(REPOSITORY), "rev-parse", "HEAD").strip()
    if revision != match[1]:
        raise ValueError(f"The engine checkout differs from the app's pinned revision. {INITIALIZE}")
    if git("-C", str(REPOSITORY), "status", "--porcelain", "--untracked-files=no").strip():
        raise ValueError("Tracked engine files have local changes. Preserve those changes in SDP "
                         "and restore the pinned engine checkout before starting the app.")
    installed = importlib.util.find_spec("sdp_xray")
    if (installed is None or installed.origin is None
            or Path(installed.origin).resolve().parent != REPOSITORY / "src/sdp_xray"):
        raise ValueError("The installed sdp-rayguard package is not this checkout's pinned engine. "
                         "Run uv sync --project backend --locked from the app checkout.")
    return revision


if __name__ == "__main__":
    try:
        print(f"Pinned engine verified: {verify_engine()}")
    except ValueError as error:
        raise SystemExit(str(error)) from error
