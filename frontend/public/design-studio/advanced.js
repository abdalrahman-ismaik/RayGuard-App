// Richer compositions share saved records and preview state. No requests or writes.
export const advancedDesigns = [
  { id: 'operations-console', number: '11', name: 'Operations Console', theme: 'Graphite and ice blue · IBM Plex Sans',
    use: 'Keep source, scan, evidence and saved activity in distinct partitions.',
    tradeoff: 'A navigation rail, saved-run list, dominant viewer, tabbed inspector and event ledger create a complete workstation. Hide secondary partitions to give the image more room.',
    layout: 'Navigation / saved runs / viewer / inspector / log', fit: 'Recommended richer workstation', advanced: true },
  { id: 'review-bench', number: '12', name: 'Review Bench', theme: 'Steel blue · IBM Plex Sans',
    use: 'Compare original pixels and model overlays with a structured evidence ledger.',
    tradeoff: 'Two synchronized views show the same scan, with findings and saved records below. The horizontal composition works best on a wide screen.',
    layout: 'Paired viewers above inspector and ledger', fit: 'For comparing and explaining evidence', advanced: true },
  { id: 'session-overview', number: '13', name: 'Session Overview', theme: 'Porcelain and navy · Segoe UI',
    use: 'Organize a saved session before opening individual results.',
    tradeoff: 'Actual loaded-run counts and a searchable table lead the layout. The selected scan and evidence remain visible alongside the records.',
    layout: 'Session summary / searchable ledger / selected scan', fit: 'For session organization', advanced: true },
  { id: 'triage-desk', number: '14', name: 'Triage Desk', theme: 'Pale slate and indigo · IBM Plex Sans',
    use: 'Work through saved review states without losing sight of the image.',
    tradeoff: 'A filterable review list and a dedicated review/provenance inspector support deliberate follow-up. Review labels reflect saved records, never automatic safety decisions.',
    layout: 'Review list / image / review inspector', fit: 'For human review and follow-up', advanced: true },
  { id: 'analyst-studio', number: '15', name: 'Analyst Studio', theme: 'Deep teal · IBM Plex Sans',
    use: 'Adjust the displayed image and arrange the evidence docks.',
    tradeoff: 'An image-adjustment dock, adjustable inspector and bottom filmstrip offer more control. Display changes affect neither saved predictions nor source pixels.',
    layout: 'Adjustment dock / viewer / inspector / filmstrip', fit: 'For detailed image inspection', advanced: true },
  { id: 'briefing-room', number: '16', name: 'Briefing Room', theme: 'Ink and cobalt · IBM Plex Sans',
    use: 'Present the scan, result and source context in a clear narrative.',
    tradeoff: 'The image and a legible evidence panel lead, with separate source and model partitions below. Session navigation remains available for questions during a demonstration.',
    layout: 'Large scan / evidence / source and model context', fit: 'For visitors and project briefings', advanced: true },
]

export function createAdvancedRenderer({ state, escape: h, icon, safeImage, scanMarkup }) {
  const initial = () => ({ view: 'inspect', tab: null, query: '', filter: 'all', sort: 'newest',
    saved: true, evidence: true, log: true, brightness: 100, contrast: 100, grayscale: false, invert: false, dock: 310 })
  let ui = initial()
  const current = () => state.runs[state.index] ?? null
  const reviewLabel = run => run?.review?.status === 'follow_up' ? 'Follow-up' : run?.review?.status === 'reviewed' ? 'Reviewed' : 'Unreviewed'
  const statusLabel = run => run?.state === 'succeeded' ? 'Completed' : run?.state === 'failed' ? 'Failed' : run?.state === 'running' ? 'Running at load' : 'Not recorded'
  const sourceLabel = run => run?.scan?.origin === 'dataset_demo' ? 'Dataset replay' : run?.scan?.origin === 'folder' ? 'Folder intake' : run?.scan?.origin === 'upload' ? 'Manual upload' : run?.scan ? 'Source not recorded' : 'No selected source'
  const stamp = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded' }
  const detections = () => current()?.state === 'succeeded' ? current().result?.detections || [] : []
  const countText = run => run.state === 'succeeded' ? `${run.result?.detections?.length ?? 0} regions` : 'No completed result'
  const threshold = run => Number.isFinite(run?.confidence) ? `${Math.round(run.confidence * 100)}%` : 'Not recorded'
  const duration = run => Number.isFinite(run?.elapsed_seconds) ? `${run.elapsed_seconds.toFixed(2)} s` : 'Not recorded'
  const filtered = () => {
    const query = ui.query.toLocaleLowerCase()
    const records = state.runs.map((run, index) => ({ run, index })).filter(({ run }) =>
      `${run.scan?.name} ${run.id}`.toLocaleLowerCase().includes(query) &&
      (ui.filter === 'all' || (ui.filter === 'failed' ? run.state === 'failed' : (run.review?.status || 'unreviewed') === ui.filter)))
    return [...records].sort((a, b) => ui.sort === 'name' ? (a.run.scan?.name || '').localeCompare(b.run.scan?.name || '') :
      ui.sort === 'oldest' ? (a.run.created_at || '').localeCompare(b.run.created_at || '') : (b.run.created_at || '').localeCompare(a.run.created_at || ''))
  }
  function summary() {
    const rows = [ ['Loaded runs', state.runs.length], ['Completed', state.runs.filter(r => r.state === 'succeeded').length],
      ['Unreviewed', state.runs.filter(r => !r.review?.status || r.review.status === 'unreviewed').length],
      ['Follow-up', state.runs.filter(r => r.review?.status === 'follow_up').length], ['Failed', state.runs.filter(r => r.state === 'failed').length] ]
    return `<section class="a-summary" aria-label="Loaded session summary"><div class="a-summary-title">Saved session<span>Actual loaded records</span></div><dl>${rows.map(([label, n]) => `<div><dt>${label}</dt><dd>${n}</dd></div>`).join('')}</dl></section>`
  }
  function filters(prefix) {
    return `<div class="a-filters"><label class="a-search-label" for="${prefix}-search">Search saved scans<input id="${prefix}-search" type="search" data-advanced-input="query" value="${h(ui.query)}" placeholder="Filename or run ID"></label>
      <div class="a-filter-row"><label for="${prefix}-filter">Review filter<select id="${prefix}-filter" data-advanced-input="filter">${[['all','All records'],['unreviewed','Unreviewed'],['follow_up','Follow-up'],['reviewed','Reviewed'],['failed','Failed runs']].map(([value,label]) => `<option value="${value}" ${ui.filter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label for="${prefix}-sort">Sort records<select id="${prefix}-sort" data-advanced-input="sort">${[['newest','Newest first'],['oldest','Oldest first'],['name','Filename']].map(([value,label]) => `<option value="${value}" ${ui.sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      <p class="a-match-count" role="status">${filtered().length} of ${state.runs.length} loaded records${current() && !filtered().some(record => record.index === state.index) ? ' · Selected scan is outside this filter.' : ''}</p></div>`
  }
  function runList(prefix, filmstrip = false) {
    const records = filtered()
    return `<section class="a-saved a-partition ${filmstrip ? 'a-filmstrip' : ''}" aria-label="Saved run browser"><div class="a-partition-heading"><h3>${filmstrip ? 'Saved image strip' : 'Saved scans'}</h3><span>${state.runs.length}</span></div>${!filmstrip ? filters(prefix) : records.length !== state.runs.length ? `<div class="a-filmstrip-filter"><p class="a-match-count" role="status">${records.length} of ${state.runs.length} loaded records${current() && !records.some(record => record.index === state.index) ? ' · Selected scan is outside this filter.' : ''}</p><button type="button" data-action="advanced-clear-filters">Clear search and filters</button></div>` : ''}
      <div class="a-run-list">${records.length ? records.map(({ run, index }) => `<button type="button" class="a-run ${index === state.index ? 'is-selected' : ''}" data-action="advanced-select" data-index="${index}" aria-pressed="${index === state.index}" aria-label="Select saved scan ${h(run.scan?.name)}">
        ${safeImage(run.scan?.image_url) ? `<img src="${safeImage(run.scan.image_url)}" alt="">` : ''}<span><strong>${h(run.scan?.name || 'Unnamed scan')}</strong><span>${reviewLabel(run)}</span><small>${countText(run)}</small></span></button>`).join('') : '<p class="a-empty">No saved scans match these filters.</p>'}</div></section>`
  }
  function ledger(prefix, standalone = false) {
    const records = filtered()
    return `<section class="a-ledger a-partition ${standalone ? 'a-ledger-full' : ''}" aria-label="Saved session ledger"><div class="a-partition-heading"><h3>Session ledger</h3><span>Saved records</span></div>${filters(prefix)}
      <div class="a-table-scroll" role="region" aria-label="Saved session table" tabindex="0"><table><thead><tr><th scope="col">Scan</th><th scope="col">Run state</th><th scope="col">Findings</th><th scope="col">Review</th><th scope="col">Started</th></tr></thead><tbody>${records.map(({ run, index }) => `<tr class="${state.index === index ? 'is-selected' : ''}"><td><button type="button" data-action="advanced-select" data-index="${index}" aria-label="Select saved scan ${h(run.scan?.name)}">${h(run.scan?.name || 'Unnamed scan')}</button></td><td>${statusLabel(run)}</td><td>${countText(run)}</td><td>${reviewLabel(run)}</td><td>${h(stamp(run.created_at))}</td></tr>`).join('')}</tbody></table>${records.length ? '' : '<p class="a-empty">No records match the current search and review filter.</p>'}</div></section>`
  }
  function viewer(label = 'Selected scan', overlay = state.overlays, mini = false) {
    const run = current()
    return `<section class="a-view a-partition" aria-label="${label}"><div class="a-view-heading"><div><h3>${label}</h3><span class="a-selected-name">${h(run?.scan?.name || 'No saved image selected')}</span></div><span>${run?.scan ? `${h(run.scan.width)} × ${h(run.scan.height)} px` : 'Awaiting saved input'}</span></div>
      <div class="a-image">${scanMarkup(overlay, mini)}</div><div class="a-view-footer"><span>${label === 'Original image' ? 'Original pixels · same selected scan' : `${state.overlays ? 'Saved overlays visible' : 'Overlays hidden'} · display only`}</span><span>${Math.round((mini ? 1 : state.zoom) * 100)}%</span></div></section>`
  }
  function facts(rows, className = '') { return `<dl class="a-facts ${className}">${rows.map(([label,value]) => `<div><dt>${label}</dt><dd>${h(value ?? 'Not recorded')}</dd></div>`).join('')}</dl>` }
  function findings() {
    const run = current()
    const items = detections()
    const title = !run ? 'Awaiting a saved run' : run.state === 'failed' ? 'Inference did not complete' : run.state !== 'succeeded' ? 'No completed result' : items.length ? `${items.length} localized ${items.length === 1 ? 'region' : 'regions'}` : 'No detections reported'
    return `<h4 class="a-result-title">${title}</h4>${items.length ? `<ol class="a-findings-list">${items.map((d,index) => `<li><span class="a-region-number">${index + 1}</span><div><strong>${h(d.category?.label)}</strong><span>${h(d.category?.namespace || 'Namespace not supplied')}</span></div><strong>${Number.isFinite(d.confidence) ? (d.confidence * 100).toFixed(1) + '%' : '—'}</strong></li>`).join('')}</ol>` : `<p class="a-result-copy">${!run ? 'Choose a real saved run to inspect its evidence.' : run.state === 'failed' ? h(run.error?.message || 'No valid result was saved.') : run.state !== 'succeeded' ? 'This read-only preview does not poll or control the run.' : 'No regions met this run’s threshold. This is not a safe or benign verdict.'}</p>`}
      ${facts([['Threshold used',threshold(run)],['Run duration',duration(run)],['Run state',run ? statusLabel(run) : 'No selected run']])}<p class="a-help">Model scores are not calibrated probabilities. Duration includes startup and is not a latency benchmark.</p>`
  }
  function review() {
    const run = current()
    return `<div class="a-review-state"><span>Saved review state</span><strong>${run ? reviewLabel(run) : 'No selected run'}</strong></div><h4>Operator note</h4><p class="a-note">${h(run?.review?.note || 'No review note saved.')}</p>${facts([['Last review update',stamp(run?.review?.updated_at)],['Selected run',run?.id]])}<p class="a-help">This preview displays the saved record. Open RayGuard to edit a note or record a review.</p><a href="/" class="a-app-link">Open working app ↗</a>`
  }
  function provenance() {
    const run = current()
    return `${facts([['Run ID',run?.id],['Model',run?.result?.model?.id],['Task namespace',run?.result?.model?.task],['Model provenance',run?.result?.model?.provenance],['Run provenance',run?.result?.run?.provenance],['Source',sourceLabel(run)],['Scan SHA-256',run?.scan?.sha256],['Original source SHA-256',run?.scan?.source_sha256]], 'a-provenance')}<p class="a-help">Provenance is displayed exactly as saved. Missing fields remain unrecorded.</p>`
  }
  function evidence(design, prefix, mini) {
    const active = mini ? 'findings' : ui.tab || (design.id === 'triage-desk' ? 'review' : 'findings')
    return `<aside class="a-evidence a-partition" aria-label="Evidence inspector"><div class="a-partition-heading"><h3>Evidence inspector</h3><span>${current() ? statusLabel(current()) : 'No run'}</span></div>
      <div class="a-evidence-tabs" role="tablist" aria-label="Evidence sections">${['findings','review','provenance'].map(tab => `<button type="button" role="tab" id="${prefix}-tab-${tab}" aria-selected="${active === tab}" aria-controls="${prefix}-evidence-panel" tabindex="${active === tab ? 0 : -1}" data-action="advanced-tab" data-tab="${tab}">${tab[0].toUpperCase() + tab.slice(1)}</button>`).join('')}</div>
      <div class="a-evidence-content" id="${prefix}-evidence-panel" role="tabpanel" aria-labelledby="${prefix}-tab-${active}" tabindex="0">${active === 'review' ? review() : active === 'provenance' ? provenance() : findings()}</div>
      <p class="a-inspector-footer">Research evidence; no safety decision.</p></aside>`
  }
  function activity() {
    const records = state.runs.filter(run => run.created_at || run.completed_at)
    return `<section class="a-log a-partition" aria-label="Saved run activity"><div class="a-partition-heading"><h3>Saved run activity</h3><span>Recorded timestamps</span></div><div class="a-activity-list" role="region" aria-label="Recorded event list" tabindex="0">${records.length ? records.map(run => `<div><time>${h(stamp(run.completed_at || run.created_at))}</time><strong>${statusLabel(run)}</strong><span>${h(run.scan?.name)}</span><span>${countText(run)}</span></div>`).join('') : '<p class="a-empty">No timestamped runs available.</p>'}</div></section>`
  }
  function sourceContext(full = false) {
    const run = current()
    const source = run?.scan?.source
    return `<section class="a-source-context a-partition ${full ? 'a-source-full' : ''}" aria-label="Source and model context"><div class="a-partition-heading"><h3>Source &amp; model context</h3><span>Selected record</span></div><div class="a-source-columns"><section><h4>Image source</h4>${facts([['Input method',sourceLabel(run)],['Dataset',source?.dataset],['Split',source?.split],['Dataset position',Number.isInteger(source?.index) ? source.index + 1 : null],['Received',stamp(run?.scan?.received_at)]])}</section><section><h4>Detection record</h4>${facts([['Model',run?.result?.model?.id],['Task',run?.result?.model?.task],['Threshold',threshold(run)],['Dimensions',run?.scan ? `${run.scan.width} × ${run.scan.height} px` : null]])}</section><section><h4>Evidence boundary</h4><p>Saved 2D scans and model results are loaded from this local service. The preview does not control acquisition, start inference or establish a scanner connection.</p><p>Empty detections do not establish a safe or benign outcome.</p><a href="/" class="a-app-link">Open working app ↗</a></section></div></section>`
  }
  function adjustments(prefix) {
    return `<section class="a-adjustments a-partition" aria-label="Image adjustment dock"><div class="a-partition-heading"><h3>Image adjustments</h3></div><div class="a-adjustment-body"><p>Display only. Source pixels and saved boxes stay unchanged.</p>${[['brightness','Brightness'],['contrast','Contrast']].map(([key,label]) => `<label for="${prefix}-${key}">${label}<output id="${prefix}-${key}-value">${ui[key]}%</output><input type="range" id="${prefix}-${key}" data-advanced-input="${key}" min="50" max="150" step="5" value="${ui[key]}"></label>`).join('')}
      <button type="button" data-action="advanced-grayscale" aria-pressed="${ui.grayscale}">Grayscale</button><button type="button" data-action="advanced-invert" aria-pressed="${ui.invert}">Invert display</button><button type="button" class="a-reset" data-action="advanced-reset-image">Reset image display</button><p class="a-help">These are visual adjustments, not material discrimination.</p></div></section>`
  }
  function toolbar(design, prefix) {
    return `<div class="a-toolbar"><div class="a-tool-context"><strong>${ui.view === 'inspect' ? 'Inspect saved evidence' : ui.view === 'session' ? 'Browse saved session' : 'Understand the source'}</strong><span>${sourceLabel(current())}</span></div>
      <div class="a-image-tools" ${ui.view === 'source' ? 'hidden' : ''}><button type="button" data-action="zoom-out" aria-label="Zoom out preview" ${!current() ? 'disabled' : ''}>${icon('minus')}</button><span>${Math.round(state.zoom * 100)}%</span><button type="button" data-action="zoom-in" aria-label="Zoom in preview" ${!current() ? 'disabled' : ''}>${icon('plus')}</button><button type="button" data-action="fit" aria-label="Fit preview image" ${!current() ? 'disabled' : ''}>${icon('fit')}</button><button type="button" data-action="overlay" aria-pressed="${state.overlays}" ${!current() ? 'disabled' : ''}>${icon('eye')}Overlays</button></div>
      <details class="a-layout-options" ${ui.view !== 'inspect' ? 'hidden' : ''}><summary>Layout options</summary><div class="a-layout-fields"><p>Show the partitions you need.</p>${[['saved','Saved scans'],['evidence','Evidence inspector'],...(['operations-console','triage-desk','briefing-room'].includes(design.id) ? [['log','Activity / context']] : [])].map(([value,label]) => `<label><input type="checkbox" data-advanced-input="${value}" ${ui[value] ? 'checked' : ''}>${label}</label>`).join('')}
        ${design.id === 'analyst-studio' ? `<label for="${prefix}-dock">Inspector width <output id="${prefix}-dock-value">${ui.dock} px</output><input id="${prefix}-dock" type="range" data-advanced-input="dock" min="260" max="380" step="20" value="${ui.dock}"></label>` : ''}<button type="button" data-action="advanced-reset-layout">Reset layout</button></div></details></div>`
  }
  function render(design, mini = false) {
    const prefix = `${design.id}${mini ? '-mini' : ''}`
    const view = mini ? 'inspect' : ui.view
    const run = current()
    const flags = mini || view !== 'inspect' ? '' : `${!ui.saved ? 'hide-saved' : ''} ${!ui.evidence ? 'hide-evidence' : ''} ${!ui.log ? 'hide-log' : ''}`
    let body
    if (view === 'source') body = `<div class="a-source-page">${sourceContext(true)}${provenance()}</div>`
    else if (view === 'session') body = `<div class="a-session-page">${summary()}${ledger(prefix, true)}<div class="a-session-selection">${viewer('Selected scan', state.overlays, mini)}${evidence(design,prefix,mini)}</div></div>`
    else if (design.id === 'review-bench') body = `<div class="a-workspace">${`<div class="a-paired-viewers">${viewer('Original image',false,mini)}${viewer('Model overlay',state.overlays,mini)}</div>`}${evidence(design,prefix,mini)}${ledger(prefix)}</div>`
    else if (design.id === 'session-overview') body = `<div class="a-workspace">${summary()}${ledger(prefix)}${viewer('Selected scan',state.overlays,mini)}${evidence(design,prefix,mini)}</div>`
    else if (design.id === 'analyst-studio') body = `<div class="a-workspace">${adjustments(prefix)}${viewer('Selected scan',state.overlays,mini)}${evidence(design,prefix,mini)}${runList(prefix,true)}</div>`
    else if (design.id === 'briefing-room') body = `<div class="a-workspace">${viewer('Selected scan',state.overlays,mini)}${evidence(design,prefix,mini)}${sourceContext()}${runList(prefix,true)}</div>`
    else body = `<div class="a-workspace">${runList(prefix)}${viewer('Selected scan',state.overlays,mini)}${evidence(design,prefix,mini)}${design.id === 'triage-desk' ? sourceContext() : activity()}</div>`
    return `<section class="advanced-station ${design.id} ${flags}" data-design="${design.id}" data-view="${view}" aria-label="${h(design.name)} design preview" style="--a-dock:${ui.dock}px;--a-brightness:${ui.brightness}%;--a-contrast:${ui.contrast}%;--a-gray:${ui.grayscale ? 1 : 0};--a-invert:${ui.invert ? 1 : 0}">
      <header class="a-header"><div class="a-brand">${icon('scan',24)}<strong>RayGuard</strong><span>Inspection workspace</span></div><div class="a-header-state"><span>Saved evidence</span><strong>${run ? statusLabel(run) : 'No saved run'}</strong></div><span class="a-preview-label">Design preview · no inference</span></header>
      <div class="a-frame"><nav class="a-nav" aria-label="Preview workspace sections">${[['inspect','scan','Inspect'],['session','list','Session'],['source','image','Source']].map(([key,glyph,label]) => `<button type="button" data-action="advanced-view" data-view="${key}" aria-current="${view === key ? 'page' : 'false'}">${icon(glyph,20)}<span>${label}</span></button>`).join('')}<div class="a-nav-foot">Read-only local evidence</div></nav>
        <div class="a-main">${toolbar(design,prefix)}${body}<footer class="a-footer"><span>${state.runs.length} loaded ${state.runs.length === 1 ? 'run' : 'runs'}${state.availableRuns > state.runs.length ? ` of ${state.availableRuns} available` : ''} · ${h(run?.scan?.name || 'No scan selected')}</span><span>No safety decision is produced.</span></footer></div></div></section>`
  }
  return {
    render,
    reset() { ui = initial() },
    click(button) {
      const action = button.dataset.action
      if (action === 'advanced-view') { ui.view = button.dataset.view; return `[data-action="advanced-view"][data-view="${ui.view}"]` }
      if (action === 'advanced-tab') { ui.tab = button.dataset.tab; return `[data-action="advanced-tab"][data-tab="${ui.tab}"]` }
      if (action === 'advanced-select') { state.index = Number(button.dataset.index); state.zoom = 1; return `[data-action="advanced-select"][data-index="${state.index}"]` }
      if (action === 'advanced-grayscale') ui.grayscale = !ui.grayscale
      if (action === 'advanced-invert') ui.invert = !ui.invert
      if (action === 'advanced-reset-image') { ui.brightness = 100; ui.contrast = 100; ui.grayscale = false; ui.invert = false }
      if (action === 'advanced-reset-layout') { ui.saved = true; ui.evidence = true; ui.log = true; ui.dock = 310 }
      if (action === 'advanced-clear-filters') { ui.query = ''; ui.filter = 'all'; return '[data-action="advanced-view"][data-view="inspect"]' }
      return `[data-action="${action}"]`
    },
    input(element) {
      const key = element.dataset.advancedInput
      if (['brightness','contrast','dock'].includes(key)) {
        ui[key] = Number(element.value)
        const station = element.closest('.advanced-station')
        station.style.setProperty(`--a-${key}`, `${ui[key]}${key === 'dock' ? 'px' : '%'}`)
        document.getElementById(`${element.id}-value`).value = `${ui[key]}${key === 'dock' ? ' px' : '%'}`
        return false
      }
      if (['saved','evidence','log'].includes(key)) ui[key] = element.checked
      else ui[key] = element.value
      return true
    },
    keydown(event) {
      if (!event.target.matches('[data-action="advanced-tab"]') || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return null
      const tabs = ['findings','review','provenance']
      const position = tabs.indexOf(event.target.dataset.tab)
      ui.tab = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (position + (event.key === 'ArrowRight' ? 1 : 2)) % 3]
      event.preventDefault()
      return `[data-action="advanced-tab"][data-tab="${ui.tab}"]`
    },
  }
}
