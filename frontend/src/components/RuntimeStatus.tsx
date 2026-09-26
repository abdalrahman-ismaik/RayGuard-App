import { LoaderCircle, Play } from 'lucide-react'
import { runtimeLabel } from '../runtime'
import type { ModelRuntime, Scan } from '../types'
import '../runtime.css'

interface Props {
  runtime: ModelRuntime
  scan: Scan | null
  connected: boolean
  busy: boolean
  verifying: boolean
  onVerify: () => void
}

export function RuntimeStatus({ runtime, scan, connected, busy, verifying, onVerify }: Props) {
  return <section className="runtime-settings" aria-label="Model runtime">
    <h3>Execution runtime</h3>
    <p className="control-help"><a href="#main-menu">Choose CPU or GPU in Workspace setup</a></p>
    <p className="runtime-state" role="status">{!connected ? 'Runtime status unavailable while offline' : verifying ? 'Verifying model execution' : runtimeLabel(runtime)}</p>
    {runtime.reason && <p className="control-help">{runtime.reason}</p>}
    {runtime.error && runtime.error.message !== runtime.reason && <p className="runtime-error" role="alert">{runtime.error.message}</p>}
    {runtime.restart_required && <p className="control-help">Restart the service before running inference. Export needed reviews first; restarting clears the current session.</p>}
    {(runtime.can_verify || verifying) && <div className="runtime-verification">
      <button type="button" className="secondary-button" disabled={!connected || busy || !scan || verifying} onClick={onVerify}>
        {verifying ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
        {verifying ? 'Verifying model…' : 'Verify with this scan'}
      </button>
      <p className="control-help">{scan ? <>Uses <strong>{scan.name}</strong> to check local execution. This does not measure detection accuracy.</>
        : <>Choose an authorized image in <a href="#workspace">Inspect</a>, then verify it here.</>}</p>
    </div>}
    <details className="runtime-details"><summary>Runtime details &amp; recovery</summary>
      <dl><dt>Policy</dt><dd>{runtime.policy === 'auto' ? 'Auto' : runtime.policy}</dd>
        <dt>Current service device</dt><dd>{runtime.selected_device ?? 'Not selected'}</dd>
        <dt>Hardware</dt><dd>{runtime.device_name ?? 'Not recorded'}</dd>
        <dt>Profile</dt><dd>{runtime.profile || 'Not recorded'}</dd>
        <dt>Model execution check</dt><dd>{runtime.model_verified ? 'Verified on this runtime' : 'Not verified'}</dd></dl>
      <p className="control-help">Use the local launcher’s <code>-SetupModel</code> option to prepare a managed model environment.</p>
      <p className="control-help">For CPU recovery, stop the service and restart the launcher with the same configuration and <code>-InferenceDevice cpu</code>. Export needed reviews first; restarting clears the current session.</p>
    </details>
  </section>
}
