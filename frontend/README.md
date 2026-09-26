# RayGuard browser workspace

React and TypeScript provide a single inspection workspace. Vite builds static
files for the local Python service; model execution stays in the separate backend
and model environment. See [application setup](../README.md) for the complete run
instructions and limitations.

```text
src/
  App.tsx                   Workspace layout and theme
  api.ts                    Typed HTTP requests and errors
  types.ts                  Browser representations of API/shared result contracts
  hooks/useWorkspace.ts     Upload, asynchronous run, recovery and session state
  components/
    InputPanel.tsx          Scan upload, model readiness and next-run threshold
    ScanCanvas.tsx          Original-coordinate overlays, selection, zoom and pan
    FindingsPanel.tsx       Detection details, run evidence and export
    SessionHistory.tsx      Actual session runs and previous-run selection
  styles.css                Local design tokens, themes and responsive layout
tests/e2e/                  Browser checks; fixtures are software tests only
```

From this directory, `npm ci` installs the locked dependencies, `npm run dev`
starts the development interface, and `npm run build` checks TypeScript and builds
`dist/`. The development server proxies `/api` to `127.0.0.1:8765`. Production uses
relative URLs and the backend serves `dist/`. No external assets or model weights
are fetched by the browser.

`npm run test:e2e` runs the browser suite described in the application verification
record. Browser fixtures never supply predictions to the application at runtime.

Image and detection overlays share one SVG coordinate space. Zoom and pan transform
both together. Arrow keys pan after zooming; `+` / `−` zoom and `0` resets to fit.
Detection boxes and the findings list are keyboard accessible. Changing the score
threshold affects the next run; previous results retain their recorded threshold.

History is limited to the current backend session. Export run JSON before restarting
if a portable record is needed. Uploaded scans, model artifacts and generated build
or test output are not source files and must remain outside Git.

The frontend moved unchanged from the SDP app directory during extraction.
Screenshot paths now resolve under this repository's ignored `output/`;
the engine submodule and backend stay separate from browser test fixtures.
