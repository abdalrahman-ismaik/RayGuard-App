import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'
import type { DatasetDemo, DemoAction, Health, Intake, Review, Run, RuntimeDeviceAction, Scan } from '../types'
import type { InputSource } from '../workspaceSetup'
import { runtimeReady } from '../runtime'

const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
const ordered = (runs: Run[]) => [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at))

export function useWorkspace() {
  const [health, setHealth] = useState<Health | null>(null)
  const [intake, setIntake] = useState<Intake | null>(null)
  const [demo, setDemo] = useState<DatasetDemo | null>(null)
  const [inputSource, setInputSource] = useState<InputSource>('upload')
  const [changingDemo, setChangingDemo] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [scan, setScan] = useState<Scan | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [changingIntake, setChangingIntake] = useState(false)
  const [requestingVerification, setRequestingVerification] = useState(false)
  const [deviceAction, setDeviceAction] = useState<RuntimeDeviceAction>({ state: 'idle', device: null, message: null })
  const [restartRequest, setRestartRequest] = useState<{ instanceId: string; device: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(25)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [followLatest, setFollowLatestState] = useState(true)
  const [newerCount, setNewerCount] = useState(0)
  const following = useRef(true)
  const selectedRun = useRef<string | null>(null)
  const knownRuns = useRef(new Set<string>())
  const deviceRequestLock = useRef(false)
  const serviceInstance = useRef<string | null>(null)
  const verifying = requestingVerification || health?.runtime?.state === 'verifying'
  const changingRuntime = deviceAction.state === 'saving' || deviceAction.state === 'restarting'
  const runtimeRestarting = changingRuntime || Boolean(health?.runtime?.choices?.restarting)
  const ready = runtimeReady(health) && !runtimeRestarting
  const busy = uploading || starting || activeId !== null || Boolean(intake?.enabled) || Boolean(demo?.enabled) || changingIntake || changingDemo || verifying || runtimeRestarting

  useEffect(() => {
    const id = health?.service_instance_id
    if (!id) return
    if (serviceInstance.current && serviceInstance.current !== id) window.location.reload()
    else serviceInstance.current = id
  }, [health?.service_instance_id])

  useEffect(() => {
    if (!restartRequest) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const started = Date.now()
    const poll = async () => {
      try {
        const status = await api.health()
        if (disposed) return
        if (status.service_instance_id && status.service_instance_id !== restartRequest.instanceId) {
          window.location.reload()
          return
        }
      } catch { /* A temporary disconnect is expected; only a new instance confirms restart. */ }
      if (disposed) return
      if (Date.now() - started >= 30_000) {
        setRestartRequest(null)
        setDeviceAction({ state: 'error', device: restartRequest.device,
          message: 'Restart was not confirmed. Check the local launcher, then reconnect the service before trying again.' })
        return
      }
      timer = setTimeout(() => { void poll() }, 750)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [restartRequest])

  const setFollowLatest = useCallback((value: boolean) => {
    following.current = value
    setFollowLatestState(value)
    if (value) setNewerCount(0)
  }, [])

  const showRun = useCallback((next: Run) => {
    if (selectedRun.current !== next.id) setSelectedId(null)
    selectedRun.current = next.id
    setRun(next)
    setScan(next.scan)
  }, [])

  const saveRun = useCallback((next: Run, select = false) => {
    setRuns((old) => ordered([next, ...old.filter((item) => item.id !== next.id)]))
    if (select || following.current || selectedRun.current === next.id) {
      knownRuns.current.add(next.id)
      showRun(next)
    }
  }, [showRun])

  const reconnect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const [status, history, source, replay] = await Promise.all([api.health(), api.runs(), api.intake(), api.demo()])
      setHealth(status)
      setIntake(source)
      setDemo(replay)
      if (source.enabled) setInputSource('folder')
      else if (replay.batch_total > 0 || replay.enabled) setInputSource('demo')
      if (source.enabled) setConfidence(Math.round(source.confidence * 100))
      else if (replay.enabled || replay.state === 'paused') setConfidence(Math.round(replay.confidence * 100))
      setRuns(ordered(history.items))
      knownRuns.current = new Set(history.items.map((item) => item.id))
      setConnected(true)
      setActiveId(status.active_run_id)
      if (status.active_run_id) saveRun(await api.run(status.active_run_id), true)
      else if (replay.last_run_id && history.items.some((item) => item.id === replay.last_run_id)) {
        showRun(history.items.find((item) => item.id === replay.last_run_id)!)
      } else {
        // Uploaded IDs and history belong to the current service session only.
        selectedRun.current = null
        setScan(null)
        setRun(null)
        setSelectedId(null)
      }
    } catch (cause) {
      setConnected(false)
      setError(message(cause))
    } finally {
      setConnecting(false)
    }
  }, [saveRun, showRun])

  useEffect(() => { void reconnect() }, [reconnect])

  // Intake can create runs without a browser action. Refresh the list while preserving
  // the selected image; only the explicit follow switch may advance the viewport.
  useEffect(() => {
    if (!connected || connecting || changingRuntime) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const [status, history, source, replay] = await Promise.all([api.health(), api.runs(), api.intake(), api.demo()])
        if (disposed) return
        setHealth(status)
        setIntake(source)
        setDemo(replay)
        if (source.enabled) setInputSource('folder')
        else if (replay.enabled) setInputSource('demo')
        if (source.enabled) setConfidence(Math.round(source.confidence * 100))
        else if (replay.enabled) setConfidence(Math.round(replay.confidence * 100))
        const items = ordered(history.items)
        const added = items.filter((item) => !knownRuns.current.has(item.id))
        knownRuns.current = new Set(items.map((item) => item.id))
        if (!following.current && added.length) setNewerCount((count) => count + added.length)
        setRuns(items)
        setActiveId(status.active_run_id)
        const next = following.current ? items[0] : items.find((item) => item.id === selectedRun.current)
        if (next) showRun(next)
        else if (selectedRun.current && !status.active_run_id) {
          selectedRun.current = null
          setRun(null)
          setScan(null)
          setSelectedId(null)
        }
      } catch (cause) {
        if (!disposed) { setConnected(false); setError(message(cause)) }
      }
      if (!disposed) timer = setTimeout(() => { void poll() }, 1200)
    }
    timer = setTimeout(() => { void poll() }, 1200)
    return () => { disposed = true; clearTimeout(timer) }
  }, [connected, connecting, changingRuntime, showRun])

  useEffect(() => {
    if (!activeId) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const next = await api.run(activeId)
        if (disposed) return
        setConnected(true)
        setError(null)
        saveRun(next)
        if (next.state !== 'running') { setActiveId(null); return }
      } catch (cause) {
        if (disposed) return
        if (cause instanceof ApiError && cause.status === 404) {
          setActiveId(null)
          selectedRun.current = null
          setRun(null)
          setScan(null)
          setSelectedId(null)
          await reconnect()
          if (!disposed) setError('The service session changed. Choose an input source and start a new run.')
          return
        }
        setConnected(false)
        setError(message(cause))
      }
      timer = setTimeout(() => { void poll() }, 900)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [activeId, saveRun, reconnect])

  const upload = async (file: File) => {
    if (busy) return
    setError(null)
    if (!/\.(png|jpe?g)$/i.test(file.name)) {
      setError('Choose a PNG or JPEG image. Other file types are not supported.')
      return
    }
    if (health && file.size > health.limits.max_upload_bytes) {
      setError(`This image is too large. The limit is ${Math.round(health.limits.max_upload_bytes / 1024 / 1024)} MB.`)
      return
    }
    setUploading(true)
    setFollowLatest(false)
    selectedRun.current = null
    setRun(null)
    setScan(null)
    setSelectedId(null)
    try {
      setScan(await api.upload(file))
      setConnected(true)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0) setConnected(false)
      setError(message(cause))
    } finally { setUploading(false) }
  }

  const start = async () => {
    if (!scan || busy || !ready || !connected) return
    setStarting(true)
    setError(null)
    setRun(null)
    setSelectedId(null)
    try {
      const next = await api.start(scan.id, confidence / 100)
      knownRuns.current.add(next.id)
      saveRun(next, true)
      setActiveId(next.state === 'running' ? next.id : null)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0) setConnected(false)
      if (cause instanceof ApiError && cause.status === 404) { setScan(null); setConnected(false) }
      setError(message(cause))
    } finally { setStarting(false) }
  }

  const selectRun = (next: Run) => {
    if (uploading || starting) return
    setFollowLatest(false)
    showRun(next)
    setError(null)
  }

  const toggleIntake = async () => {
    if (!intake || !connected || changingIntake) return
    if (!intake.enabled && (!ready || verifying)) return
    setChangingIntake(true)
    setError(null)
    try {
      const next = await api.setIntake(!intake.enabled, confidence / 100)
      setIntake(next)
      if (next.enabled) setInputSource('folder')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0) setConnected(false)
      setError(message(cause))
    } finally { setChangingIntake(false) }
  }

  const controlDemo = async (value: DemoAction) => {
    if (!connected || changingDemo) return
    if (value.action !== 'pause' && (!ready || verifying)) return
    setChangingDemo(true)
    setError(null)
    try {
      setDemo(await api.setDemo(value))
      setInputSource('demo')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0) setConnected(false)
      setError(message(cause))
    } finally { setChangingDemo(false) }
  }

  const selectSource = (value: InputSource) => {
    if (busy) return
    setInputSource(value)
  }

  const verifyRuntime = async () => {
    if (!connected || !scan || !health?.runtime?.can_verify || busy) return
    setRequestingVerification(true)
    setFollowLatest(false)
    setError(null)
    try {
      const runtime = await api.verifyRuntime(scan.id)
      setHealth(current => current ? { ...current, runtime } : current)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 0) setConnected(false)
      setError(message(cause))
    } finally { setRequestingVerification(false) }
  }

  const setRuntimeDevice = async (device: string, restart: boolean, modelId?: string) => {
    const choices = health?.runtime?.choices
    const instanceId = health?.service_instance_id
    if (deviceRequestLock.current || !connected || busy || !instanceId || !choices?.can_save
      || (restart && !choices.can_restart) || !choices.options.some(option => option.device === device && option.selectable)
      || (choices.model_options && !choices.model_options.some(option => option.id === modelId && option.selectable))) return
    deviceRequestLock.current = true
    const subject = choices.model_options ? 'Model and device choices' : 'Device choice'
    setDeviceAction({ state: 'saving', device, message: restart ? 'Applying configuration…' : 'Saving configuration…' })
    setError(null)
    try {
      const result = choices.model_options && modelId
        ? await api.setRuntimeSelection(modelId, device, instanceId, restart)
        : await api.setRuntimeDevice(device, instanceId, restart)
      if (result.runtime) setHealth(current => current ? { ...current, runtime: result.runtime } : current)
      if (result.restarting) {
        setDeviceAction({ state: 'restarting', device: result.device, message: 'Restarting the local service. Waiting for a new service session…' })
        setRestartRequest({ instanceId, device: result.device })
      } else {
        setDeviceAction({ state: 'saved', device: result.device, message: `${subject} saved for the next launch. The current service ${choices.model_options ? 'configuration' : 'device'} is unchanged.` })
      }
    } catch (cause) {
      if (restart && cause instanceof ApiError && cause.status === 0) {
        // The service may have accepted the request before its response was lost. Never repost automatically.
        setDeviceAction({ state: 'restarting', device, message: 'The restart response was interrupted. Checking for a new service session…' })
        setRestartRequest({ instanceId, device })
      } else {
        setDeviceAction({ state: 'error', device, message: message(cause) })
      }
    } finally { deviceRequestLock.current = false }
  }

  const review = async (id: string, value: Pick<Review, 'status' | 'note'>) => {
    const next = await api.review(id, value)
    setRuns((old) => old.map((item) => item.id === next.id ? next : item))
    if (selectedRun.current === next.id) showRun(next)
  }

  const follow = (value: boolean) => {
    setFollowLatest(value)
    if (value && runs[0]) showRun(runs[0])
  }

  return { health, intake, demo, inputSource, selectSource, changingDemo, controlDemo, connected, connecting, reconnect, scan, run, runs, activeId, uploading,
    busy, ready, verifying, verifyRuntime, changingRuntime, deviceAction, setRuntimeDevice, starting, error, confidence, setConfidence, selectedId, setSelectedId,
    upload, start, selectRun, changingIntake, toggleIntake, followLatest, setFollowLatest: follow,
    newerCount, review }
}
