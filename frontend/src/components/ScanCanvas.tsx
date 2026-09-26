import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Expand, Eye, EyeOff, ImagePlus, Minus, Plus, ScanLine, ScanSearch, Search } from 'lucide-react'
import { EyeMotion } from './EyeMotion'
import type { Detection, Scan } from '../types'
import type { ViewAdjustmentValues } from './ViewAdjustments'
import type { ComparisonState } from '../hooks/useAnnotationComparison'
import { comparisonLabels } from './AnnotationPanel'
import './scan-interactions.css'

interface Props {
  viewerId?: string
  title?: string
  processingAbove?: boolean
  returnFocusTo?: string
  emptyState?: { title: string; description: string }
  scan: Scan | null
  detections: Detection[]
  selectedId: string | null
  onSelect: (id: string) => void
  processing: boolean
  uploading: boolean
  starting?: boolean
  motionPaused?: boolean
  connected?: boolean
  receiving: boolean
  demoMode?: boolean
  onInspect: () => void
  adjustments: ViewAdjustmentValues
  comparison: ComparisonState
}

type Point = { x: number; y: number }
type View = { zoom: number; pan: Point }
type Drag = { pointerId: number; client: Point; point: Point; pan: Point; moved: boolean }
type Lens = { scanId: string; x: number; y: number; left: number; top: number; size: number; extent: number; source: Point }
const fitted: View = { zoom: 1, pan: { x: 0, y: 0 } }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

// Client pixels → SVG viewBox pixels, including letterboxing and CSS scaling.
function svgPoint(element: SVGGraphicsElement, clientX: number, clientY: number) {
  const matrix = element.getScreenCTM()
  return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null
}

export function ScanCanvas({ viewerId = 'scan-viewer', title = 'Scan viewer', processingAbove = false, returnFocusTo, emptyState, scan, detections, selectedId, onSelect, processing, uploading, starting, motionPaused, connected = true, receiving, demoMode, onInspect, adjustments, comparison }: Props) {
  const [view, setView] = useState<View>(fitted)
  const viewRef = useRef(view)
  const { zoom, pan } = view
  const [overlays, setOverlays] = useState(true)
  const [annotations, setAnnotations] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [magnifier, setMagnifier] = useState(false)
  const [lens, setLens] = useState<Lens | null>(null)
  const { brightness, contrast, grayscale, inverted } = adjustments
  const stage = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const scene = useRef<SVGGElement>(null)
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)

  useLayoutEffect(() => {
    const element = panel.current
    return () => {
      // A temporary viewer can disappear while a keyboard user is inspecting it.
      if (returnFocusTo && element?.contains(document.activeElement)) {
        requestAnimationFrame(() => document.getElementById(returnFocusTo)?.focus({ preventScroll: true }))
      }
    }
  }, [returnFocusTo])

  const clearDrag = () => {
    const pointerId = drag.current?.pointerId
    drag.current = null
    if (pointerId !== undefined && svg.current?.hasPointerCapture(pointerId)) svg.current.releasePointerCapture(pointerId)
    setDragging(false)
  }

  useEffect(() => {
    viewRef.current = fitted
    setView(fitted)
    clearDrag()
    suppressClick.current = false
    setLens(null)
    setMagnifier(false)
    setImageFailed(false)
    setAnnotations(true)
  }, [scan?.id])

  useEffect(() => {
    // Inspection stays mounted across dashboard routes. Hide transient gestures when resized/hidden.
    const element = stage.current
    if (!element) return
    const observer = new ResizeObserver(() => { clearDrag(); setLens(null) })
    observer.observe(element)
    const blur = () => { clearDrag(); setLens(null) }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { clearDrag(); setLens(null); setMagnifier(false) }
    }
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', escape)
    return () => { observer.disconnect(); window.removeEventListener('blur', blur); window.removeEventListener('keydown', escape) }
  }, [])

  const updateView = (next: View) => {
    if (!scan) return
    // Keep each image edge covering its fitted frame: the scan cannot be dragged away.
    const xLimit = scan.width * (next.zoom - 1) / 2
    const yLimit = scan.height * (next.zoom - 1) / 2
    const bounded = { zoom: next.zoom, pan: { x: clamp(next.pan.x, -xLimit, xLimit), y: clamp(next.pan.y, -yLimit, yLimit) } }
    viewRef.current = bounded
    setView(bounded)
  }
  const fit = () => {
    clearDrag()
    updateView(fitted)
    setLens(null)
    setMagnifier(false)
  }
  const zoomAt = (value: number, anchor?: Point) => {
    if (!scan || imageFailed) return
    const current = viewRef.current
    const next = clamp(value, 1, 5)
    const center = { x: scan.width / 2, y: scan.height / 2 }
    const point = anchor ?? center
    const ratio = next / current.zoom
    clearDrag()
    setLens(null)
    updateView({ zoom: next, pan: {
      x: point.x - center.x - (point.x - center.x - current.pan.x) * ratio,
      y: point.y - center.y - (point.y - center.y - current.pan.y) * ratio,
    } })
  }

  useEffect(() => {
    const element = svg.current
    if (!element || !scan || imageFailed) return
    const wheel = (event: WheelEvent) => {
      // Leave browser zoom / trackpad pinch available; own only ordinary viewer scrolling.
      if (event.ctrlKey || event.metaKey || !event.deltaY) return
      event.preventDefault()
      const point = svgPoint(element, event.clientX, event.clientY)
      if (!point) return
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      zoomAt(viewRef.current.zoom * Math.exp(-clamp(pixels, -600, 600) * 0.0015), point)
      onInspect()
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [scan?.id, imageFailed, onInspect])

  const showLens = (event: PointerEvent<SVGSVGElement>) => {
    if (!magnifier || !scan || !scene.current || !svg.current || !stage.current || event.pointerType === 'touch') return
    const source = svgPoint(scene.current, event.clientX, event.clientY)
    const matrix = scene.current.getScreenCTM()
    if (!source || !matrix || source.x < 0 || source.y < 0 || source.x > scan.width || source.y > scan.height) {
      setLens(null)
      return
    }
    const bounds = stage.current.getBoundingClientRect()
    const imageBounds = svg.current.getBoundingClientRect()
    const size = Math.min(176, imageBounds.width - 16, imageBounds.height - 16)
    if (size <= 0) return
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    const leftEdge = imageBounds.left - bounds.left + 8
    const topEdge = imageBounds.top - bounds.top + 8
    const rightEdge = imageBounds.right - bounds.left - 8
    const bottomEdge = imageBounds.bottom - bounds.top - 8
    const left = clamp(x + 22 + size <= rightEdge ? x + 22 : x - size - 22, leftEdge, rightEdge - size)
    const top = clamp(y - size / 2, topEdge, bottomEdge - size)
    // 3× the currently displayed scale, with the exact source pixel at the lens center.
    setLens({ scanId: scan.id, x, y, left, top, size, source, extent: size / (Math.hypot(matrix.a, matrix.b) * 3) })
    onInspect()
  }
  const pointerStart = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !event.isPrimary) return
    suppressClick.current = false
    if (!scan || imageFailed || viewRef.current.zoom === 1) return
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY)
    if (!point) return
    drag.current = { pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY }, point, pan: viewRef.current.pan, moved: false }
  }
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) { showLens(event); return }
    if (!active.moved && Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) < 4) return
    const point = svgPoint(event.currentTarget, event.clientX, event.clientY)
    if (!point) return
    active.moved = true
    suppressClick.current = true
    // Delay capture until an actual drag so a simple click still selects a finding.
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    setLens(null)
    updateView({ zoom: viewRef.current.zoom, pan: { x: active.pan.x + point.x - active.point.x, y: active.pan.y + point.y - active.point.y } })
  }
  const pointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    if (event.type === 'pointercancel') setLens(null)
    if (drag.current?.pointerId === event.pointerId) clearDrag()
  }
  const failImage = () => { clearDrag(); setLens(null); setMagnifier(false); setImageFailed(true) }
  const labelSize = scan ? Math.max(scan.width, scan.height) * 0.022 : 20
  const adjusted = brightness !== 100 || contrast !== 100 || grayscale || inverted
  const reference = comparison.comparison?.status === 'available' ? comparison.comparison : null
  const boxes = reference?.boxes ?? []

  // Both views show the same pixels and visible layers; lens copies have no interaction or duplicate IDs.
  const layers = (magnified = false) => scan && <>
    <image href={scan.image_url} width={scan.width} height={scan.height} style={{ filter: `brightness(${brightness}%) contrast(${contrast}%) grayscale(${grayscale ? 1 : 0}) invert(${inverted ? 1 : 0})` }} onError={failImage} />
    {annotations && boxes.map((box, index) => {
      const [x1, y1, x2, y2] = box.box_xyxy
      return <g key={box.annotation_id} className={magnified ? 'magnifier-annotation' : 'annotation-box'} data-annotation={magnified ? undefined : box.annotation_id}
        role={magnified ? undefined : 'img'} aria-label={magnified ? undefined : `Dataset annotation ${index + 1}: ${box.label}`}>
        <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} vectorEffect="non-scaling-stroke" />
        <rect className="annotation-label-background" x={x1} y={y2 - labelSize * 1.5} width={labelSize * 2.8} height={labelSize * 1.5} />
        <text x={x1 + labelSize * 1.4} y={y2 - labelSize * .4} fontSize={labelSize} textAnchor="middle">GT{index + 1}</text>
      </g>
    })}
    {overlays && detections.map((detection, index) => {
      const [x1, y1, x2, y2] = detection.box_xyxy
      const selected = selectedId === detection.id
      return <g key={detection.id} data-detection={magnified ? undefined : detection.id} role={magnified ? undefined : 'button'} tabIndex={magnified ? undefined : 0}
        aria-label={magnified ? undefined : `Finding ${index + 1}: ${detection.category.label}, ${(detection.confidence * 100).toFixed(1)}% model score`}
        aria-pressed={magnified ? undefined : selected} className={`${magnified ? 'magnifier-detection' : 'detection-box'} ${selected ? 'is-selected' : ''}`}
        onClick={magnified ? undefined : () => onSelect(detection.id)} onKeyDown={magnified ? undefined : (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(detection.id) }
        }}>
        <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} vectorEffect="non-scaling-stroke" />
        <rect className="box-number-background" x={x1} y={y1} width={labelSize * 1.5} height={labelSize * 1.5} />
        <text x={x1 + labelSize * 0.75} y={y1 + labelSize * 1.05} fontSize={labelSize} textAnchor="middle">{index + 1}</text>
      </g>
    })}
  </>

  const activity = (processing || uploading) && <div className={`canvas-processing eye-processing ${processingAbove ? 'processing-above' : ''}`} role="status"><EyeMotion paused={motionPaused || !connected} />
    <span className="processing-copy">{!connected ? 'Service unavailable · run status unknown' : uploading ? 'Preparing your scan' : starting ? 'Starting inference' : 'Running local inference'}
      <span>{!connected ? 'Reconnect to check the current run' : uploading ? 'Checking image and dimensions' : 'Local execution may take a moment'}</span></span></div>

  return <section ref={panel} id={viewerId} className="canvas-panel" aria-label={title} tabIndex={-1} onPointerDownCapture={() => { if (scan) onInspect() }} onKeyDownCapture={() => { if (scan) onInspect() }}>
    <div className="canvas-heading">
      <div><ScanLine size={17} /><div className="canvas-title"><h2>{title}</h2>{scan && <p title={scan.name}>{scan.name}</p>}</div></div>
      <span>{scan ? `${scan.width} × ${scan.height} px` : receiving ? 'Waiting for exported images' : demoMode ? 'Dataset replay' : 'Awaiting input'}</span>
    </div>
    {processingAbove && activity}
    <div ref={stage} className={`image-stage ${dragging ? 'is-panning' : ''} ${zoom > 1 ? 'is-zoomed' : ''} ${magnifier ? 'has-magnifier' : ''}`}>
      {scan && !imageFailed ? <svg ref={svg} className="scan-svg" viewBox={`0 0 ${scan.width} ${scan.height}`}
        style={{ touchAction: zoom > 1 ? 'none' : 'auto' }}
        preserveAspectRatio="xMidYMid meet" aria-label={`X-ray scan: ${scan.name}`} role="group" tabIndex={0}
        onPointerDown={pointerStart} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
        onLostPointerCapture={pointerEnd} onPointerLeave={() => { setLens(null); if (drag.current && !drag.current.moved) clearDrag() }}
        onClickCapture={(event) => { if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(viewRef.current.zoom + 0.25) }
          if (event.key === '-') { event.preventDefault(); zoomAt(viewRef.current.zoom - 0.25) }
          if (event.key === '0') { event.preventDefault(); fit() }
          if (zoom > 1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault()
            setLens(null)
            const step = Math.min(scan.width, scan.height) * 0.05
            updateView({ zoom: viewRef.current.zoom, pan: {
              x: viewRef.current.pan.x + (event.key === 'ArrowRight' ? -step : event.key === 'ArrowLeft' ? step : 0),
              y: viewRef.current.pan.y + (event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0),
            } })
          }
        }}>
        <g ref={scene} transform={`translate(${pan.x} ${pan.y}) translate(${scan.width / 2} ${scan.height / 2}) scale(${zoom}) translate(${-scan.width / 2} ${-scan.height / 2})`}>
          {layers()}
        </g>
      </svg> : <div className="canvas-empty">
        <div className="empty-scan-mark"><span /><ImagePlus size={42} strokeWidth={1.15} /><span /></div>
        <h3>{imageFailed ? 'Image could not be displayed' : emptyState?.title ?? (receiving ? 'Waiting for the next export' : 'Your scan will appear here')}</h3>
        <p>{imageFailed ? 'Reconnect the service or upload the scan again.' : emptyState?.description ?? (receiving ? 'New images from the configured folder will be queued for detection.' : demoMode ? 'Start the demo above to inspect recorded test images.' : 'Choose an X-ray image above to begin.')}</p>
      </div>}
      {scan && magnifier && lens?.scanId === scan.id && !imageFailed && <>
        <span className="magnifier-crosshair" aria-hidden="true" style={{ left: lens.x, top: lens.y }} />
        <div className="scan-magnifier" aria-hidden="true" style={{ left: lens.left, top: lens.top, width: lens.size, height: lens.size }}>
          <svg viewBox={`${lens.source.x - lens.extent / 2} ${lens.source.y - lens.extent / 2} ${lens.extent} ${lens.extent}`} focusable="false">{layers(true)}</svg>
          <span>3×</span>
        </div>
      </>}
      {!processingAbove && activity}
    </div>
    {scan && <div className="canvas-tools" role="toolbar" aria-label="Image controls">
      <button type="button" aria-label="Zoom out" disabled={imageFailed || zoom <= 1} onClick={() => zoomAt(viewRef.current.zoom - 0.25)}><Minus size={17} /></button>
      <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="Zoom in" disabled={imageFailed || zoom >= 5} onClick={() => zoomAt(viewRef.current.zoom + 0.25)}><Plus size={17} /></button>
      <span className="toolbar-divider" />
      <button type="button" aria-label="Fit image" title="Fit image (0)" disabled={imageFailed} onClick={fit}><Expand size={17} /></button>
      <button type="button" className="magnifier-toggle" aria-label="Magnifier" aria-pressed={magnifier} disabled={imageFailed}
        title="Hover over the scan for a 3× magnified view. Escape to close." onClick={() => { setLens(null); setMagnifier(value => !value) }}><Search size={17} aria-hidden="true" />Magnifier</button>
      <span className="toolbar-divider" />
      <button type="button" disabled={imageFailed} aria-label={overlays ? 'Hide detection overlays' : 'Show detection overlays'} aria-pressed={overlays}
        onClick={() => setOverlays((value) => !value)}>{overlays ? <Eye size={17} /> : <EyeOff size={17} />}</button>
      {comparison.eligible && <button type="button" className="annotation-toggle" disabled={imageFailed || !boxes.length} aria-label={annotations ? 'Hide dataset annotations' : 'Show dataset annotations'} aria-pressed={annotations && boxes.length > 0}
        title="Published dataset annotations, independent of model overlays" onClick={() => setAnnotations(value => !value)}><ScanSearch size={17} aria-hidden="true" />Reference</button>}
    </div>}
    <div className="canvas-footer"><span className="canvas-legend"><span className="coordinate-key"><span />{detections.length ? `${detections.length} model ${detections.length === 1 ? 'region' : 'regions'}` : 'Detector regions appear in amber'}</span>
      {boxes.length > 0 && <span className="coordinate-key annotation-key"><span />Dataset annotations · cyan / GT</span>}</span>
      {comparison.eligible && <span className="comparison-viewer-status">{reference?.evaluation ? comparisonLabels[reference.evaluation.outcome] : comparison.loading ? 'Loading reference…' : 'Reference not evaluated'}</span>}
      <span>{scan ? adjusted ? 'View adjusted · original model input' : magnifier ? 'Hover for 3× detail · Esc to close' : zoom > 1 ? 'Scroll to zoom · drag to pan · 0 to fit' : 'Scroll or + / − to zoom' : 'Local image · No external upload'}</span>
    </div>
  </section>
}
