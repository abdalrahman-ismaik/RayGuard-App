import type { AnnotationComparison, DatasetDemo, DemoAction, Health, Intake, ModelRuntime, Review, Run, Scan } from './types'

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, options)
  } catch {
    throw new ApiError('The local service is unavailable. Start the RayGuard service and reconnect.', 0)
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const detail = (body as { detail?: unknown } | null)?.detail
    if (detail && typeof detail === 'object' && 'message' in detail) {
      throw new ApiError(String(detail.message), response.status)
    }
    throw new ApiError(`Request could not be completed (${response.status}). Check the input and try again.`, response.status)
  }
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<Health>('/health'),
  verifyRuntime: (scan_id: string) => request<ModelRuntime>('/runtime/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scan_id }),
  }),
  setRuntimeDevice: (device: string, service_instance_id: string, restart: boolean) => request<{ device: string; restarting: boolean; runtime?: ModelRuntime }>('/runtime/device', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device, service_instance_id, restart }),
  }),
  setRuntimeSelection: (model_id: string, device: string, service_instance_id: string, restart: boolean) => request<{ model_id: string; device: string; restarting: boolean; runtime?: ModelRuntime }>('/runtime/selection', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model_id, device, service_instance_id, restart }),
  }),
  runs: () => request<{ items: Run[] }>('/runs'),
  run: (id: string) => request<Run>(`/runs/${encodeURIComponent(id)}`),
  comparison: (id: string) => request<AnnotationComparison>(`/runs/${encodeURIComponent(id)}/comparison`),
  intake: () => request<Intake>('/intake'),
  demo: () => request<DatasetDemo>('/demo'),
  setDemo: (value: DemoAction) => request<DatasetDemo>('/demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
  }),
  setIntake: (enabled: boolean, confidence: number) => request<Intake>('/intake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, confidence }),
  }),
  review: (id: string, review: Pick<Review, 'status' | 'note'>) => request<Run>(`/runs/${encodeURIComponent(id)}/review`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review),
  }),
  upload: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<Scan>('/scans', { method: 'POST', body })
  },
  start: (scan_id: string, confidence: number) => request<Run>('/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scan_id, confidence }),
  }),
  exportRun: (id: string) => request<unknown>(`/runs/${encodeURIComponent(id)}/export`),
}
