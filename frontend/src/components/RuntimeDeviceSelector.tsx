import { useId, useState } from 'react'
import { CircuitBoard, Cpu, LoaderCircle, RefreshCw } from 'lucide-react'
import { runtimeLabel } from '../runtime'
import type { Health, RuntimeDeviceAction } from '../types'
import { ModelClasses } from './ModelClasses'
import '../runtime.css'

interface Props {
  health: Health | null
  connected: boolean
  busy: boolean
  action: RuntimeDeviceAction
  onApply: (device: string, restart: boolean, modelId?: string) => void
  onReconnect: () => void
}

export function RuntimeDeviceSelector({ health, connected, busy, action, onApply, onReconnect }: Props) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [gpuDraft, setGpuDraft] = useState<string | null>(null)
  const [modelDraft, setModelDraft] = useState<string | null>(null)
  const runtime = health?.runtime
  const choices = runtime?.choices
  const models = choices?.model_options
  const requestedModel = modelDraft ?? choices?.saved_model_id ?? choices?.default_model_id ?? health?.model.id
  const selectedModel = models?.find(option => option.id === requestedModel)
  const requested = draft ?? choices?.saved_device ?? choices?.default_device ?? null
  const selected = choices?.options.some(option => option.device === requested) ? requested : null
  const currentDevice = runtime?.selected_device ?? null
  const cpu = choices?.options.find(option => option.kind === 'cpu')
  const gpus = choices?.options.filter(option => option.kind === 'gpu') ?? []
  const gpu = gpus.find(option => option.device === (selected?.startsWith('cuda:') ? selected : gpuDraft))
    ?? gpus.find(option => option.device === choices?.default_device) ?? gpus.find(option => option.selectable) ?? gpus[0]
  const selectedOption = choices?.options.find(option => option.device === selected)
  const currentOption = choices?.options.find(option => option.device === currentDevice)
  const changing = action.state === 'saving' || action.state === 'restarting' || Boolean(choices?.restarting)
  const disabled = !connected || busy || changing || !health?.service_instance_id
  const selectedKind = selected === 'cpu' ? 'CPU' : selected?.startsWith('cuda:') ? 'GPU' : null
  const currentKind = currentDevice === 'cpu' ? 'CPU' : currentDevice?.startsWith('cuda:') ? 'GPU' : null

  return <section className="runtime-device-selector" aria-label="Inference device settings">
    {models && <h3 className="runtime-configuration-title">Model &amp; compute</h3>}
    <p className="runtime-current-model"><strong>Current model:</strong> {health?.model.label ?? 'Service unavailable'}</p>
    <p className="runtime-current"><strong>Current service:</strong> {currentKind ?? (runtime ? 'Not selected' : 'CPU configuration')}
      {currentOption && currentOption.name !== currentKind && <span> · {currentOption.name}</span>}
      <small>{!connected ? 'Service status unavailable' : runtime ? runtimeLabel(runtime) : 'Device switching requires an updated local service.'}</small>
    </p>
    {!choices ? <><h3>Inference device</h3><p className="control-help">This service does not expose device choices. Relaunch RayGuard with an updated local launcher to choose CPU or a compatible GPU.</p></>
      : <>
        {models ? <div className="runtime-model-selection">
          <label htmlFor={`${id}-model`}>Model</label>
          <select id={`${id}-model`} value={selectedModel?.id ?? ''} disabled={disabled} aria-describedby={`${id}-model-help`}
            onChange={event => setModelDraft(event.target.value)}>
            {!selectedModel && <option value="" disabled>Choose an available model</option>}
            {models.map(option => <option key={option.id} value={option.id} disabled={!option.selectable}>{option.label}{!option.selectable ? ' — unavailable' : ''}</option>)}
          </select>
          <div id={`${id}-model-help`}>
            {selectedModel ? <>
              <p className="control-help">{selectedModel.description}</p>
              <ModelClasses classes={selectedModel.classes} task={selectedModel.task} />
              {selectedModel.reason && <p className="control-help">{selectedModel.reason}</p>}
            </> : <p className="control-help">The previous model is not in this service’s catalog. Choose an available model.</p>}
            <p className="control-help">One model runs at a time. The selected model and device must pass runtime verification after restart.</p>
          </div>
          {models.some(option => !option.selectable) && <details className="runtime-unavailable-models"><summary>Unavailable models</summary>
            <ul>{models.filter(option => !option.selectable).map(option => <li key={option.id}><strong>{option.label}</strong>: {option.reason || 'No verified local model pairing is available.'}{!option.classes.length && ' Classes not verified.'}</li>)}</ul>
          </details>}
        </div> : <p className="control-help">Model selection requires an updated local service. The current model stays active.</p>}
        <fieldset className="runtime-device-options" disabled={disabled} aria-describedby={`${id}-device-help`}>
          <legend>Inference device</legend>
          <div className="runtime-device-cards">
            <label className={`runtime-device-card ${selected === 'cpu' ? 'is-selected' : ''}`}>
              <input type="radio" name={`${id}-device`} aria-label="CPU" aria-describedby={`${id}-cpu-description`} checked={selected === 'cpu'}
                disabled={!cpu?.selectable} onChange={() => setDraft('cpu')} />
              <Cpu size={20} aria-hidden="true" /><span><strong>CPU</strong><small id={`${id}-cpu-description`}>{cpu?.name || 'System processor'}
                {cpu?.reason && <span>{cpu.reason}</span>}{!cpu && <span>No CPU option reported by this service.</span>}</small></span>
            </label>
            <label className={`runtime-device-card ${selected?.startsWith('cuda:') ? 'is-selected' : ''}`}>
              <input type="radio" name={`${id}-device`} aria-label="GPU" aria-describedby={`${id}-gpu-description`} checked={Boolean(selected?.startsWith('cuda:'))}
                disabled={!gpus.some(option => option.selectable)} onChange={() => {
                  const next = gpu?.selectable ? gpu : gpus.find(option => option.selectable)
                  if (next) { setDraft(next.device); setGpuDraft(next.device) }
                }} />
              <CircuitBoard size={20} aria-hidden="true" /><span><strong>GPU</strong><small id={`${id}-gpu-description`}>{gpu?.name || 'No compatible GPU reported'}
                {!choices.saved_device && choices.default_device?.startsWith('cuda:') && <span className="runtime-device-default">Default on this host</span>}
                {gpu?.reason && <span>{gpu.reason}</span>}{!gpu && <span>{runtime?.state === 'checking' ? 'Hardware check is in progress.' : 'Model setup or a supported CUDA runtime may be required.'}</span>}</small></span>
            </label>
          </div>
          {gpus.length > 1 && selected?.startsWith('cuda:') && <label className="runtime-gpu-list">GPU device
            <select value={selected} onChange={event => { setDraft(event.target.value); setGpuDraft(event.target.value) }}>
              {gpus.map(option => <option key={option.device} value={option.device} disabled={!option.selectable}>{option.name} ({option.device}){!option.selectable ? ' — unavailable' : ''}</option>)}
            </select>
          </label>}
        </fieldset>
        <p id={`${id}-device-help`} className="control-help">{selectedKind ? <>Selected for {choices.can_restart ? 'restart' : 'next launch'}: {selectedModel && <><strong>{selectedModel.label}</strong> · </>}<strong>{selectedKind}</strong>{selectedOption && <> · {selectedOption.name}</>}. </> : 'Choose an available device. '}
          Hardware detection does not verify the model. Opening the workspace keeps the current service configuration.</p>
        {choices.saved_model_id && <p className="control-help">Saved model: {models?.find(option => option.id === choices.saved_model_id)?.label || choices.saved_model_id}.</p>}
        {choices.saved_device && <p className="control-help">Saved device: {choices.saved_device === 'cpu' ? 'CPU' : choices.options.find(option => option.device === choices.saved_device)?.name || choices.saved_device}.</p>}
        {requested && !selected && <p className="control-help">The previously selected device is no longer reported by this service. Choose CPU or a detected GPU.</p>}
        {!changing && choices.restart_block_reason && <p className="control-help">{choices.restart_block_reason}</p>}
        <p className="runtime-restart-warning">Restart clears in-memory scans, history and queues. Export needed reviews first.</p>
        <button type="button" className="secondary-button runtime-device-apply"
          disabled={disabled || !choices.can_save || !selectedOption?.selectable || Boolean(models && !selectedModel?.selectable)}
          onClick={() => { if (selected) onApply(selected, choices.can_restart, selectedModel?.id) }}>
          {changing ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          {changing ? action.state === 'saving' ? 'Saving configuration…' : 'Restarting service…' : choices.can_restart ? 'Apply and restart' : 'Save for next launch'}
        </button>
      </>}
    {action.message && <p className={action.state === 'error' ? 'runtime-error' : 'control-help'} role={action.state === 'error' ? 'alert' : 'status'}>{action.message}</p>}
    {action.state === 'error' && <button type="button" className="text-button" onClick={onReconnect}>Reconnect service</button>}
  </section>
}
