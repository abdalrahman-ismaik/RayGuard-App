export interface Scan {
  id: string
  name: string
  width: number
  height: number
  sha256: string
  image_url: string
  origin?: 'upload' | 'folder' | 'dataset_demo'
  source?: { dataset: 'IEDXray'; split: 'test'; index: number }
  source_sha256?: string
  received_at?: string
}

export interface Detection {
  id: string
  kind: 'device' | 'suspicious_region'
  box_xyxy: [number, number, number, number]
  category: { namespace: string; label: string }
  confidence: number
  device_id: string | null
}

export interface ScanResult {
  schema_version: '1.0'
  scan_id: string
  status: 'ok' | 'missing_input' | 'error'
  image: { width: number; height: number } | null
  model: { id: string; task: string; provenance: string }
  run: { id: string; provenance: string }
  threshold: number
  detections: Detection[]
  error: { code: string; message: string } | null
}

export interface Review {
  status: 'unreviewed' | 'reviewed' | 'follow_up'
  note: string
  updated_at: string | null
}

export interface Intake {
  configured: boolean
  enabled: boolean
  state: 'unconfigured' | 'paused' | 'waiting' | 'receiving' | 'backpressure' | 'error'
  adapter: 'folder'
  hardware_verified: false
  source_label: string
  confidence: number
  pending_count: number
  received_count: number
  last_received_at: string | null
  error: { code: string; message: string } | null
  pending: { id: string; scan: Scan; state: 'queued' }[]
  issues: { id: string; name: string; code: string; message: string; occurred_at: string }[]
}

export interface DatasetDemo {
  configured: boolean
  source_label: string
  enabled: boolean
  state: 'unconfigured' | 'ready' | 'running' | 'paused' | 'completed' | 'error'
  total: number
  cursor: number
  next_name: string | null
  current_name: string | null
  batch_total: number
  completed_count: number
  last_run_id: string | null
  confidence: number
  interval_seconds: number
  error: { code: string; message: string } | null
}

export interface DemoAction {
  action: 'start' | 'pause' | 'resume'
  start_index?: number
  count?: number
  confidence?: number
}

export interface Run {
  id: string
  scan_id: string
  scan: Scan
  state: 'running' | 'succeeded' | 'failed'
  created_at: string
  completed_at: string | null
  confidence: number
  elapsed_seconds: number | null
  result: ScanResult | null
  error: { code: string; message: string } | null
  review?: Review
  execution?: ExecutionRecord
  model?: { id: string; label: string; task: string; kind: Detection['kind']; classes: string[]; provenance: string }
}

export interface ExecutionRecord {
  schema_version: string
  policy: string
  profile: string
  requested_device: string
  actual_device: string | null
  device_name: string | null
  device_id?: string | null
  precision: string | null
  python?: string | null
  torch?: string | null
  torchvision?: string | null
  cuda?: string | null
  cudnn?: string | number | null
  backend?: string | null
  selection_reason?: string | null
}

export interface ModelRuntime {
  policy: string
  state: 'checking' | 'verification_required' | 'ready' | 'unavailable' | 'verifying'
  ready: boolean
  selected_device: string | null
  profile: string
  device_name: string | null
  reason: string | null
  verification_scan_id: string | null
  error: { code: string; message: string } | null
  can_verify: boolean
  model_verified: boolean
  restart_required: boolean
  choices?: RuntimeDeviceChoices
}

export interface RuntimeDeviceOption {
  device: string
  kind: 'cpu' | 'gpu'
  name: string
  selectable: boolean
  reason: string | null
}

export interface RuntimeDeviceChoices {
  options: RuntimeDeviceOption[]
  default_device: string | null
  saved_device: string | null
  can_save: boolean
  can_restart: boolean
  restart_block_reason: string | null
  restarting: boolean
  model_options?: RuntimeModelOption[]
  default_model_id?: string | null
  saved_model_id?: string | null
}

export interface RuntimeModelOption {
  id: string
  label: string
  family: string
  task: string | null
  kind: Detection['kind'] | null
  classes: string[]
  description: string
  selectable: boolean
  reason: string | null
}

export interface RuntimeDeviceAction {
  state: 'idle' | 'saving' | 'restarting' | 'saved' | 'error'
  device: string | null
  message: string | null
}

export interface Health {
  model: { id: string; label: string; task: string; configured: boolean; reason: string | null; classes?: string[]; kind?: Detection['kind'] | null }
  limits: { max_upload_bytes: number; max_pixels: number }
  active_run_id: string | null
  runtime?: ModelRuntime
  service_instance_id?: string
}

export interface AnnotationComparison {
  schema_version: 'rayguard.annotation-comparison.v1'
  run_id: string
  status: 'available' | 'unavailable'
  reason: string | null
  task: string
  iou_threshold: number
  annotation_source: { name: string; sha256: string; split: 'test' } | null
  image_id: number | null
  image_sha256: string | null
  boxes: { annotation_id: number; category_id: number; label: string; box_xyxy: [number, number, number, number] }[]
  evaluation: {
    outcome: 'matched' | 'missed' | 'extra' | 'mixed' | 'empty'
    matched: number
    missed: number
    extra: number
    matches: { annotation_id: number; detection_id: string; iou: number }[]
    missed_annotation_ids: number[]
    extra_detection_ids: string[]
  } | null
  warnings: string[]
}
