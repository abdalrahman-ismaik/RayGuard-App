# Contributing to RayGuard App

Read [README.md](README.md), [AGENTS.md](AGENTS.md), [status](docs/status.md)
and [architecture](docs/architecture.md). Research requirements and the only team
backlog remain in [SDP-I-RayGuard](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md).
Use an existing task ID and agree file ownership before parallel edits. A branch
name or generated change does not establish a student's contribution or understanding.

Clone recursively, or run `git submodule update --init --recursive` before setup.
The `engine/` submodule is a pinned dependency. Change contracts, detector scripts,
model catalog and runtime locks in SDP first; review a specific engine commit here
and rerun the affected checks. Do not use an unpinned tracking-branch update.

From this repository root, install and check the API:

```powershell
uv sync --project backend --locked
uv run --project backend --locked ruff check backend
uv run --project backend --locked python -m pytest backend/tests
```

Check the frontend:

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
```

From `frontend/`, run `npx playwright install chromium`, then `npm run test:e2e`.
Alternatively set `PLAYWRIGHT_CHANNEL=chrome` when Chrome is installed. Tests start
their own local Vite service and intercept API calls with synthetic fixtures.
No model, scanner or private dataset is required. Generated browser evidence
belongs in ignored `output/` or Playwright's ignored result directories.

For interactive development, run `uv run --project backend --locked rayguard-gui`
and, in another terminal, `npm --prefix frontend run dev`. Vite proxies `/api`
to the loopback backend on port 8765. Model dependencies stay in their separate
environment; do not install Torch into the API environment.

Use a task branch and open a pull request. [CODEOWNERS](.github/CODEOWNERS) names
the maintainer for review; this file does not itself prove GitHub branch rules
are enabled. Preserve existing work and keep changes small enough to explain.
Backend Linux/Windows checks and frontend build/browser checks run in
[CI](.github/workflows/ci.yml). New tests should target meaningful behavior.

Before sharing, review the diff and explicit staged paths. Keep local configs,
scans, weights, environments, runs, credentials and private source documents out
of Git. Preserve third-party attribution and bundled font licenses. Record actual
commands, outcomes, ownership and limitations in [progress](docs/progress.md)
and update [status](docs/status.md) when the handoff changes. Distinguish synthetic
software checks, real inference, measured performance and human review.
