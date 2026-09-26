// Compact and advanced compositions share read-only local evidence; no inference APIs.
import { advancedDesigns, createAdvancedRenderer } from './advanced.js'
const compactDesigns = [
  { id: 'integrated-console', name: 'Integrated Console', number: '01', theme: 'Graphite · IBM Plex Sans',
    use: 'A balanced everyday inspection desk.',
    tradeoff: 'The image leads; a narrow review panel stays visible. Secondary details take an extra click.',
    layout: 'Image + right review', fit: 'Recommended starting point' },
  { id: 'daylight-desk', name: 'Daylight Desk', number: '02', theme: 'Cool white · Segoe UI',
    use: 'Bright labs and longer reading sessions.',
    tradeoff: 'A light frame and slim source rail make navigation familiar, using a little more horizontal space.',
    layout: 'Slim rail + wide viewer', fit: 'For a lit laboratory' },
  { id: 'image-wall', name: 'Image Wall', number: '03', theme: 'Carbon · IBM Plex Sans',
    use: 'Put the scan ahead of every other element.',
    tradeoff: 'The viewer spans the screen. Findings move into a bottom dock, so longer reports need scrolling.',
    layout: 'Full-width image + bottom dock', fit: 'Maximum scan area' },
  { id: 'comparison-bench', name: 'Comparison Bench', number: '04', theme: 'Slate blue · IBM Plex Sans',
    use: 'Explain what the detector adds to the original image.',
    tradeoff: 'Original and overlay views show the same scan. Two panes reduce each image’s size on a laptop.',
    layout: 'Original / overlay comparison', fit: 'For explaining detections' },
  { id: 'queue-first', name: 'Queue First', number: '05', theme: 'Midnight · IBM Plex Sans',
    use: 'Review a sequence of recorded scans.',
    tradeoff: 'A visible filmstrip makes sequence changes clear. Three columns work best on wider displays.',
    layout: 'Filmstrip + viewer + findings', fit: 'For dataset replay' },
  { id: 'evidence-desk', name: 'Evidence Desk', number: '06', theme: 'Paper and navy · Segoe UI',
    use: 'Read the model evidence closely beside the scan.',
    tradeoff: 'Image and report have equal weight. There is less image space but more room for review and provenance.',
    layout: 'Equal image / evidence panes', fit: 'For technical review' },
  { id: 'focus-station', name: 'Focus Station', number: '07', theme: 'Deep teal · IBM Plex Sans',
    use: 'Inspect a large image, then open its details.',
    tradeoff: 'A collapsible review panel gives the image room. Hidden evidence must be deliberately reopened.',
    layout: 'Large viewer + details panel', fit: 'For close visual inspection' },
  { id: 'compact-workstation', name: 'Compact Workstation', number: '08', theme: 'Titanium · Segoe UI',
    use: 'Keep tools close on a laptop display.',
    tradeoff: 'Compact tool rows and a bottom evidence strip fit more context. Text is denser than the other options.',
    layout: 'Tools + image + evidence strip', fit: 'For smaller laptops' },
  { id: 'presentation-studio', name: 'Presentation Studio', number: '09', theme: 'Ink and cobalt · IBM Plex Sans',
    use: 'Present the project to visitors from a distance.',
    tradeoff: 'Large labels, an expansive image and a broad result area are easy to explain. Less detail fits at once.',
    layout: 'Image above large result panel', fit: 'For SLG / poster demonstrations' },
  { id: 'review-workspace', name: 'Review Workspace', number: '10', theme: 'Warm gray and indigo · IBM Plex Sans',
    use: 'Work through saved runs and their review state.',
    tradeoff: 'A vertical run timeline anchors the workflow. This is better for deliberate review than rapid scanning.',
    layout: 'Run timeline + inspection canvas', fit: 'For follow-up and handoffs' },
]
const designs = [...advancedDesigns, ...compactDesigns]

const content = document.querySelector('#content')
const announce = document.querySelector('#announcement')
const state = { runs: [], availableRuns: 0, index: 0, loaded: false, unavailable: false, overlays: true, zoom: 1, details: true, focus: false, category: 'advanced' }
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const safeImage = value => typeof value === 'string' && /^\/api\/scans\/[a-f0-9]{32}\/image$/.test(value) ? value : null
const selectedDesign = () => designs.find(design => design.id === new URLSearchParams(location.search).get('design'))
const current = () => state.runs[state.index] ?? null
const favorites = () => { try { return JSON.parse(localStorage.getItem('rayguard-design-favorites') || '[]').filter(id => designs.some(d => d.id === id)) } catch { return [] } }
const icon = (name, size = 17) => {
  const paths = {
    scan: '<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4M7 8h10v8H7z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m4 18 6-6 4 4 3-4 4 6"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    next: '<path d="m9 5 7 7-7 7"/>', prev: '<path d="m15 5-7 7 7 7"/>',
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.scan}</svg>`
}
const advanced = createAdvancedRenderer({ state, escape, icon, safeImage, scanMarkup })

function sourceText() {
  if (!state.loaded) return 'Looking for saved local runs…'
  if (!current()) return state.unavailable ? 'Local service unavailable · empty previews remain usable' : 'No saved runs · previews show an honest empty state'
  const count = state.availableRuns > state.runs.length ? `Showing ${state.runs.length} of ${state.availableRuns} saved runs` : `${state.runs.length} saved ${state.runs.length === 1 ? 'run' : 'runs'} available`
  return `${count} · images and results stay on this machine`
}

function scanMarkup(overlay = state.overlays, mini = false) {
  const run = current()
  const scan = run?.scan
  const url = safeImage(scan?.image_url)
  const width = Number(scan?.width)
  const height = Number(scan?.height)
  if (!url || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return `<div class="scan-empty">${icon('scan', 44)}<strong>No saved scan selected</strong><span>Open RayGuard to produce a real result, then reload this preview.</span></div>`
  }
  const detections = run.state === 'succeeded' ? run.result?.detections || [] : []
  const boxes = overlay ? detections.map((detection, index) => {
    const box = detection.box_xyxy
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return ''
    const [x1, y1, x2, y2] = box
    if (x2 <= x1 || y2 <= y1) return ''
    const text = Math.max(width, height) * .023
    return `<g class="model-box"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}"/><rect class="box-label" x="${x1}" y="${Math.max(0, y1 - text * 1.35)}" width="${text * 2.1}" height="${text * 1.35}"/><text x="${x1 + text * .6}" y="${Math.max(text, y1 - text * .35)}" font-size="${text}">${index + 1}</text></g>`
  }).join('') : ''
  return `<svg class="scan-image" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escape(scan.name)}${overlay ? ' with saved result overlays' : ' original image'}"><g transform="translate(${width / 2} ${height / 2}) scale(${mini ? 1 : state.zoom}) translate(${-width / 2} ${-height / 2})"><image href="${url}" width="${width}" height="${height}"/>${boxes}</g></svg>`
}

function evidenceMarkup() {
  const run = current()
  if (!run) return `<p class="evidence-label">RESULT</p><h3>Awaiting a saved run</h3><p class="evidence-copy">The layout is ready. Real model evidence appears here after inference in RayGuard.</p><div class="empty-evidence">No findings or metrics invented.</div>`
  const detections = run.state === 'succeeded' ? run.result?.detections || [] : []
  const heading = run.state === 'failed' ? 'Inference did not complete' : run.state === 'running' ? 'Run in progress' : detections.length ? `${detections.length} localized ${detections.length === 1 ? 'region' : 'regions'}` : 'No detections reported'
  const items = detections.map((d, i) => `<li><span class="region-number">${i + 1}</span><span><strong>${escape(d.category?.label)}</strong><small>Model-localized region</small></span><b>${Number.isFinite(d.confidence) ? (d.confidence * 100).toFixed(1) : '—'}<small>% score</small></b></li>`).join('')
  const review = run.review?.status === 'reviewed' ? 'Reviewed' : run.review?.status === 'follow_up' ? 'Follow-up recorded' : 'Unreviewed'
  return `<p class="evidence-label">SAVED MODEL RESULT</p><h3>${heading}</h3>${items ? `<ol class="regions">${items}</ol>` : `<p class="evidence-copy">${run.state === 'succeeded' ? 'No regions met this run’s threshold. This is not a safe or benign verdict.' : escape(run.error?.message || 'This preview does not poll or control inference.')}</p>`}
    <dl class="evidence-facts"><div><dt>Threshold</dt><dd>${Number.isFinite(run.confidence) ? Math.round(run.confidence * 100) + '%' : 'Not recorded'}</dd></div><div><dt>Run duration</dt><dd>${Number.isFinite(run.elapsed_seconds) ? run.elapsed_seconds.toFixed(2) + ' s' : 'Not recorded'}</dd></div><div><dt>Review</dt><dd>${review}</dd></div></dl>
    <div class="review-record"><strong>Operator review</strong><p>${escape(run.review?.note || 'No review note saved.')}</p><span>Review actions are available in the working app.</span></div>`
}

function historyMarkup(timeline = false) {
  if (!state.runs.length) return `<div class="saved-heading">${timeline ? 'Review timeline' : 'Saved scans'}</div><p class="history-placeholder">No saved runs yet.</p>`
  return `<div class="saved-heading">${timeline ? 'Review timeline' : 'Saved scans'} <span>${state.runs.length}</span></div><div class="saved-runs">${state.runs.map((run, index) => `<button type="button" data-action="select-run" data-index="${index}" class="saved-run ${index === state.index ? 'is-selected' : ''}" aria-pressed="${index === state.index}" aria-label="Preview saved run for ${escape(run.scan?.name)}">${safeImage(run.scan?.image_url) ? `<img src="${safeImage(run.scan.image_url)}" alt="">` : icon('image')}<span><strong>${escape(run.scan?.name || 'Unnamed scan')}</strong><small>${run.state === 'succeeded' ? 'Completed' : run.state === 'failed' ? 'Failed' : 'Running'}${run.review?.status === 'follow_up' ? ' · Follow-up' : ''}</small></span></button>`).join('')}</div>`
}

function workstation(design, mini = false) {
  if (design.advanced) return advanced.render(design, mini)
  const run = current()
  const scan = run?.scan
  const comparison = design.id === 'comparison-bench'
  const source = scan?.origin === 'dataset_demo' ? 'Dataset replay' : scan?.origin === 'folder' ? 'Folder intake' : scan?.origin === 'upload' ? 'Uploaded image' : scan ? 'Source not recorded' : 'Saved local evidence'
  return `<section class="station ${design.id} ${!state.details && !mini ? 'details-closed' : ''}" aria-label="${escape(design.name)} design preview">
    <div class="station-bar"><div class="station-identity">${icon('scan', 22)}<strong>RayGuard</strong><span>Inspection workspace</span></div><span class="station-mode">Research preview</span></div>
    <div class="station-tools"><div class="preview-source"><span class="source-mark"></span>${source}<span class="saved-badge">Saved result</span></div><div class="viewer-actions">
      <button type="button" data-action="zoom-out" aria-label="Zoom out preview" ${!scan ? 'disabled' : ''}>${icon('minus')}</button><span class="zoom-label">${Math.round((mini ? 1 : state.zoom) * 100)}%</span><button type="button" data-action="zoom-in" aria-label="Zoom in preview" ${!scan ? 'disabled' : ''}>${icon('plus')}</button><button type="button" data-action="fit" aria-label="Fit preview image" ${!scan ? 'disabled' : ''}>${icon('fit')}</button>
      <button type="button" data-action="overlay" class="labeled-tool" aria-pressed="${state.overlays}" ${!scan ? 'disabled' : ''}>${icon('eye')}<span>Overlays</span></button><button type="button" data-action="details" class="labeled-tool" aria-pressed="${state.details}">${icon('list')}<span>Details</span></button>
    </div></div>
    <aside class="station-rail">${design.id === 'review-workspace' ? historyMarkup(true) : `<div class="rail-label">WORKSPACE</div><span class="rail-current">${icon('scan')}<span>Inspect</span></span><span class="rail-context">${icon('image')}<span>Saved input</span></span><span class="rail-note">Layout preview</span>`}</aside>
    <div class="station-viewer"><div class="viewer-heading"><strong>${comparison ? 'Original image' : 'Scan viewer'}</strong><span>${scan ? `${escape(scan.width)} × ${escape(scan.height)} px` : 'Awaiting input'}</span></div><div class="scan-stage">${scanMarkup(comparison ? false : state.overlays, mini)}</div><div class="scan-caption"><span>${escape(scan?.name || 'No scan selected')}</span><span>${comparison ? 'Same scan · original pixels' : 'Display only'}</span></div></div>
    <div class="station-comparison"><div class="viewer-heading"><strong>Model overlay</strong><span>Same image</span></div><div class="scan-stage">${scanMarkup(state.overlays, mini)}</div><div class="scan-caption"><span>Saved predictions</span><span>No second scanner view</span></div></div>
    <aside class="station-findings">${evidenceMarkup()}</aside>
    <section class="station-history" aria-label="Saved scan selection">${historyMarkup()}</section>
    <footer class="station-footer"><span>Research output supports inspection; it does not establish a safety decision.</span><span class="preview-only">Design preview only</span></footer>
  </section>`
}

function gallery() {
  const saved = favorites()
  const visible = state.category === 'advanced' ? advancedDesigns : state.category === 'compact' ? compactDesigns : designs
  document.title = 'RayGuard · 16 workspace designs'
  content.className = 'gallery-main'
  content.innerHTML = `<section class="gallery-intro"><div><p class="intro-label">WORKSPACE DIRECTIONS · 16 OPTIONS</p><h1>Choose your inspection workspace.</h1><p class="intro-copy">Six richer dashboards organize saved scans, image inspection, evidence and source context into distinct working partitions. Explore their navigation and controls, or compare the original ten compact alternatives.</p></div><div class="evidence-note">${icon('image', 22)}<div><strong>Real evidence, when available</strong><p>${escape(sourceText())}.</p><span>Every composition uses the same selected scan. Nothing runs or changes in the working app.</span></div></div></section>
    <div class="gallery-toolbar"><div class="gallery-filters" role="group" aria-label="Design categories">${[['advanced','Advanced workstations · 6'],['compact','Compact alternatives · 10'],['all','All designs · 16']].map(([id,label]) => `<button type="button" data-action="category" data-category="${id}" aria-pressed="${state.category === id}">${label}</button>`).join('')}</div><span class="favorite-count">${saved.length} saved ${saved.length === 1 ? 'option' : 'options'}</span></div>
    <div class="design-grid ${state.category !== 'compact' ? 'advanced-grid' : ''}">${visible.map(design => `<article class="design-card"><div class="mini-stage" aria-hidden="true" inert>${workstation(design, true)}</div><div class="design-card-copy"><div class="design-card-title"><span>${design.number}</span><h2>${design.name}</h2><button type="button" class="save-button ${saved.includes(design.id) ? 'is-saved' : ''}" data-action="favorite" data-design="${design.id}" aria-label="${saved.includes(design.id) ? 'Unsave' : 'Save'} ${design.name}" aria-pressed="${saved.includes(design.id)}">${saved.includes(design.id) ? 'Saved' : 'Save'}</button></div><p>${design.use}</p><div class="design-tags"><span>${design.layout}</span><span>${design.theme}</span></div><a class="open-preview" href="?design=${design.id}">Open preview <span aria-hidden="true">↗</span></a></div></article>`).join('')}</div>
    <footer class="gallery-footer"><strong>Your choice sets the next implementation.</strong><p>Saving an option stays in this browser. Nothing is sent, published or changed in the working app. Open a design and copy its name to share your choice.</p></footer>`
}

function preview(design) {
  const index = designs.indexOf(design)
  const saved = favorites().includes(design.id)
  document.title = `RayGuard · ${design.name}`
  content.className = 'preview-main'
  content.innerHTML = `<div class="preview-navigation"><a class="back-link" href="./">${icon('prev')} All 16 designs</a><span class="focus-notice">Design preview · no inference</span><div class="design-navigation"><button type="button" class="nav-arrow" data-action="previous-design" aria-label="Previous design">${icon('prev')}</button><label class="visually-hidden" for="design-select">Choose design</label><select id="design-select">${designs.map(d => `<option value="${d.id}" ${d.id === design.id ? 'selected' : ''}>${d.number} · ${d.name}</option>`).join('')}</select><button type="button" class="nav-arrow" data-action="next-design" aria-label="Next design">${icon('next')}</button><button type="button" class="secondary-action focus-toggle" data-action="focus" aria-pressed="${state.focus}">${state.focus ? 'Exit focus view' : 'Focus preview'}</button></div></div>
    <section class="preview-intro"><div><p class="intro-label">Option ${design.number} · ${design.fit}</p><h1>${design.name}</h1><p>${design.tradeoff}</p></div><div class="choice-actions"><button type="button" class="secondary-action" data-action="favorite" data-design="${design.id}" aria-pressed="${saved}">${saved ? 'Saved option' : 'Save option'}</button><button type="button" class="primary-action" data-action="copy-choice" data-design="${design.id}">Copy my choice</button></div></section>
    <div class="preview-controls"><span>${design.theme}</span><div><span class="saved-source">${current() ? `Saved image ${state.index + 1} of ${state.runs.length}` : 'No saved image'}</span><button type="button" class="text-action" data-action="next-image" ${state.runs.length < 2 ? 'disabled' : ''}>Next saved image ${icon('next', 15)}</button></div></div>
    <div class="preview-host">${workstation(design)}</div><p class="preview-explanation">${escape(sourceText())}. Zoom, overlay, details and saved-image controls affect this preview only. No model run or review record is created.</p>
    <div class="preview-bottom"><a href="?design=${designs[(index + designs.length - 1) % designs.length].id}">← ${designs[(index + designs.length - 1) % designs.length].name}</a><a href="?design=${designs[(index + 1) % designs.length].id}">${designs[(index + 1) % designs.length].name} →</a></div>`
}

function render() { const design = selectedDesign(); document.body.classList.toggle('focus-preview', Boolean(design && state.focus)); if (design) preview(design); else gallery() }
function navigate(id) {
  const url = new URL(location.href)
  if (id) url.searchParams.set('design', id); else url.searchParams.delete('design')
  history.pushState({}, '', url)
  state.zoom = 1; state.details = true
  advanced.reset()
  render(); content.focus(); window.scrollTo({ top: 0 })
}
function rerenderControls(action, target = '') {
  const scroll = scrollY
  render()
  content.querySelector(`[data-action="${action}"]${target}`)?.focus({ preventScroll: true })
  window.scrollTo({ top: scroll })
}
function notify(message) { announce.textContent = message; setTimeout(() => { if (announce.textContent === message) announce.textContent = '' }, 6000) }
function renderAdvanced(selector, caret) {
  const top = scrollY
  const open = Boolean(content.querySelector('.a-layout-options[open]'))
  render()
  if (open) content.querySelector('.a-layout-options')?.setAttribute('open', '')
  const target = content.querySelector(selector)
  target?.focus({ preventScroll: true })
  if (caret !== undefined && target?.setSelectionRange) target.setSelectionRange(caret, caret)
  window.scrollTo({ top })
}

document.addEventListener('click', async event => {
  const link = event.target.closest('a')
  if (link && (link.getAttribute('href')?.startsWith('?design=') || link.matches('.back-link'))) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault(); navigate(new URL(link.href).searchParams.get('design')); return
  }
  const button = event.target.closest('button[data-action]')
  if (!button || button.disabled) return
  const action = button.dataset.action
  const design = selectedDesign()
  if (action.startsWith('advanced-')) { renderAdvanced(advanced.click(button)); return }
  if (action === 'category') { state.category = button.dataset.category; rerenderControls(action, `[data-category="${state.category}"]`); return }
  if (action === 'previous-design' || action === 'next-design') {
    navigate(designs[(designs.indexOf(design) + (action === 'next-design' ? 1 : designs.length - 1)) % designs.length].id); return
  }
  if (action === 'favorite') {
    const id = button.dataset.design
    const saved = favorites()
    const next = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id]
    try { localStorage.setItem('rayguard-design-favorites', JSON.stringify(next)); rerenderControls(action, `[data-design="${id}"]`); notify(`${designs.find(d => d.id === id).name} ${next.includes(id) ? 'saved in this browser' : 'removed from saved options'}.`) }
    catch { notify('Browser storage is unavailable. Use Copy my choice instead.') }
    return
  }
  if (action === 'copy-choice') {
    const text = `RayGuard design choice: ${design.number} — ${design.name}. ${design.layout}; ${design.theme}.`
    try { await navigator.clipboard.writeText(text); notify('Design choice copied. Paste it in the project conversation.') }
    catch { notify(text) }
    return
  }
  if (action === 'zoom-in') state.zoom = Math.min(3, Number((state.zoom + .25).toFixed(2)))
  if (action === 'zoom-out') state.zoom = Math.max(1, Number((state.zoom - .25).toFixed(2)))
  if (action === 'fit') state.zoom = 1
  if (action === 'overlay') state.overlays = !state.overlays
  if (action === 'details') state.details = !state.details
  if (action === 'focus') { state.focus = !state.focus; rerenderControls(action); window.scrollTo({ top: 0 }); return }
  if (action === 'next-image' || action === 'select-run') { state.index = action === 'select-run' ? Number(button.dataset.index) : (state.index + 1) % state.runs.length; state.zoom = 1 }
  rerenderControls(action, action === 'select-run' ? `[data-index="${state.index}"]` : '')
})
document.addEventListener('change', event => { if (event.target.id === 'design-select') navigate(event.target.value) })
document.addEventListener('input', event => {
  const element = event.target
  if (!element.matches('[data-advanced-input]')) return
  const caret = element.type === 'search' ? element.selectionStart : undefined
  if (advanced.input(element)) renderAdvanced(`[data-advanced-input="${element.dataset.advancedInput}"]`, caret)
})
window.addEventListener('popstate', render)
document.addEventListener('keydown', event => {
  const selector = advanced.keydown(event)
  if (selector) { renderAdvanced(selector); return }
  if (event.key === 'Escape' && state.focus) { state.focus = false; rerenderControls('focus') }
})

render()
try {
  const response = await fetch('/api/runs', { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('Local service unavailable')
  const data = await response.json()
  const available = Array.isArray(data.items) ? data.items.filter(run => run && safeImage(run.scan?.image_url)) : []
  state.availableRuns = available.length
  state.runs = available.slice(0, 50)
} catch { state.unavailable = true }
finally { state.loaded = true; render() }
