# Workspace setup within the dashboard

User-requested extension, 26 September 2026; task [T28](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md).
This Operate surface helps the team configure inspection on its local laptop.
The later [continuous dashboard request](dashboard-design.md) moves it into the
shared Liquid Glass shell as **Workspace setup**. The base address now opens
Dashboard; this setup remains at `/#main-menu`. Dark/light options and the selected
body font persist. Native workflow choices keep their original behavior.

This setup page makes one choice prominent: the workflow. A vertical workflow
list sits beside the selected workflow's settings. Users see real source/model
availability, choose Analyst Studio or Focused review, optionally select panels,
then open the workspace. A compact launch summary explains what opens. On narrow
screens the list precedes settings and launch in one column. Appearance stays in
the shared header, beside a visible Dark mode / Light mode shortcut for Onyx and
Onyx Light. The shortcut preserves the selected font and browser persistence.
A returning user can resume the existing workspace directly.

- Upload opens manual image selection; dataset replay opens its finite-batch
  controls; folder receipt opens its receiver controls; review opens saved runs.
- Threshold affects future runs only. Follow-arrival preference applies to
  replay/folder viewing. No mode selection or setup submission starts acquisition,
  downloads, training or inference. The operator still presses the source's Start.
- Busy work locks source/threshold setup while review and return remain available.
  Returning to the menu does not pause a service job. Source/model availability is
  reported from the service; configuration is not successful inference evidence.
- Sources needing configuration show their limitation and a Source settings path.
  No arbitrary path picker or unverified detector list is presented.
- The workspace remains mounted while hidden, preserving zoom, filters and draft
  review. Hash navigation supports all five pages with back and forward; a direct
  `/#workspace` link supports returning users. Setup is for this tab; appearance
  keeps its existing local persistence. A service restart still clears session history.

Verification must cover keyboard focus, both Onyx variants, phone layout, all
four paths, changed readiness, zero writes before explicit actions, draft/view
retention and follow preference through intake start. Browser fixtures remain
synthetic; saved scan presentation checks are read-only and prove no new accuracy.
