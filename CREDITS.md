# Credits and provenance

**GUI direction and repository maintenance:** Abd Alrahman Basim Ismaik
([@abdalrahman-ismaik](https://github.com/abdalrahman-ismaik)). The app reflects
his interface choices, iteration requests and stewardship. Development used
AI-assisted implementation, testing and documentation; tool output is not evidence
of an individual's code understanding, unrecorded work or hours.

**Project context:** this app was extracted from the local GUI work in
[SDP-I-RayGuard](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard).
The SDP team, advisors, lab work, research requirements and upstream research
remain separately attributed in that repository. App maintenance does not claim
sole authorship of the SDP project, datasets, detector architectures or weights.
The original GUI work was unpublished working-tree content at extraction; this
repository does not fabricate an earlier GUI commit history or student authorship.

**Inference dependency:** `engine/` records the exact SDP commit used by this app.
The shared contracts, model catalog, runtime setup and inference scripts have one
authoritative source there. Model and dataset attribution is recorded in the
[SDP checkpoint catalog](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/checkpoint-catalog.md)
and [research record](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/research.md).
The supported checkpoints and original THU-MIG YOLOv10 backend are upstream work;
no weights or dataset images are distributed in this repository.

**Interface dependencies:** React, Vite, TypeScript, Lucide, FastAPI, Uvicorn and
the other declared packages retain their respective authorship and licenses.
Exact versions are in `frontend/package-lock.json` and `backend/uv.lock`.

**Fonts:** IBM Plex Sans, Barlow, Instrument Serif, Geist, Inter, Manrope,
Public Sans and Source Sans 3 retain their copyright notices and SIL Open Font
License texts under [frontend/public/fonts](frontend/public/fonts/README.md).
The [choices](frontend/public/fonts/choices/README.md),
[console](frontend/public/fonts/console/README.md) and
[Instrument Serif](frontend/public/fonts/liquid/README.md) records identify sources,
modifications and hashes. Font selection does not establish measured usability.

**Eye media:** the user supplied and selected the original eye package from his
planner reference and authorized publishing this application with the selected
derived intro, loop and poster. [The media record](frontend/public/media/rayguard/README.md)
preserves source/derivative hashes and processing details. The original generation
prompt was unavailable; no reconstructed prompt is claimed to be the original.
No separate media-license document accompanied that package. This attribution
does not invent a new third-party license or claim ownership of others' work.
Private source URLs and the separate planner source package are not published here.

No new blanket software or asset license is assigned by this extraction.
Third-party licenses remain applicable to their own material.
