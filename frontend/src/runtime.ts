import type { Health, ModelRuntime } from './types'

/** Older CPU services have no runtime record; retain their configuration checks. */
export const runtimeReady = (health: Health | null) => Boolean(health?.model.configured)
  && (!health?.runtime || (health.runtime.ready && health.runtime.state === 'ready' && !health.runtime.restart_required))

export function runtimeLabel(runtime: ModelRuntime): string {
  if (runtime.restart_required) return 'Restart required'
  if (runtime.state === 'checking') return 'Checking runtime'
  if (runtime.state === 'verifying') return 'Verifying model execution'
  if (runtime.state === 'verification_required') return 'Model check pending'
  if (runtime.state === 'unavailable') return 'Runtime unavailable'
  if (runtime.selected_device?.startsWith('cuda:')) return runtime.model_verified
    ? `GPU ready: ${runtime.device_name || runtime.selected_device}` : 'GPU model check pending'
  return runtime.model_verified ? 'CPU ready' : 'CPU configured'
}
