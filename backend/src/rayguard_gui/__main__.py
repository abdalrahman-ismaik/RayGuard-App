"""Run one loopback-only server; the model always runs in a separate process."""

import argparse
import re
from dataclasses import replace
from pathlib import Path

import uvicorn

from .api import create_app
from .config import Settings
from .engine import verify_engine
from .runtime_policy import PolicyStore

RESTART_EXIT_CODE = 75


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, help="Local JSON settings; relative paths use its folder")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--device", help="Session policy override: auto, cpu or visible cuda:N")
    parser.add_argument("--workspace-restart", action="store_true",
                        help="Allow the supervising launcher to restart after a workspace device change")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if args.device is not None and not re.fullmatch(r"auto|cpu|cuda:(0|[1-9][0-9]{0,2})", args.device):
        parser.error("device must be auto, cpu or cuda:N")
    try:
        verify_engine()
        settings = Settings.from_file(args.config)
        policy_store = PolicyStore(args.config) if args.config is not None else None
        if policy_store is not None:
            settings = policy_store.load(settings, apply=args.device is None)
        if args.device is not None:
            settings = replace(settings, inference_device=args.device)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    restart_requested = False

    def request_restart():
        nonlocal restart_requested
        restart_requested = True
        server.should_exit = True

    app = create_app(
        settings, policy_store=policy_store,
        restart_callback=request_restart if args.workspace_restart and policy_store else None,
    )
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=args.port, workers=1))
    server.run()
    # Only the launcher that opted in handles this exit. Crashes are never restarted.
    return RESTART_EXIT_CODE if restart_requested else 0


if __name__ == "__main__":
    raise SystemExit(main())
