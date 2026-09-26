import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { eyePoster } from './EyeMotion'

interface Props {
  status: string
  onComplete: () => void
}

/** A bounded brand introduction. Media completion never signals model readiness. */
export function RayGuardIntro({ status, onComplete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const finish = useCallback(() => {
    if (finishTimer.current) return
    setLeaving(true)
    finishTimer.current = setTimeout(onComplete, 250)
  }, [onComplete])

  useEffect(() => {
    const modal = dialog.current!
    const media = video.current!
    let disposed = false
    let started = false
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.showModal()
    const markStarted = () => { started = true }
    const fallback = () => {
      if (disposed) return
      media.pause()
      setFailed(true)
      finish()
    }
    media.addEventListener('playing', markStarted)
    const loadLimit = setTimeout(() => { if (!started) fallback() }, 1000)
    const introLimit = setTimeout(finish, 6750)
    media.addEventListener('ended', finish)
    void media.play().catch(fallback)
    const onHidden = () => { if (document.hidden) onComplete() }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      disposed = true
      clearTimeout(loadLimit)
      clearTimeout(introLimit)
      if (finishTimer.current) clearTimeout(finishTimer.current)
      finishTimer.current = null
      media.removeEventListener('playing', markStarted)
      media.removeEventListener('ended', finish)
      document.removeEventListener('visibilitychange', onHidden)
      media.pause()
      modal.close()
      document.body.style.overflow = previousOverflow
    }
  }, [finish, onComplete])

  return <dialog ref={dialog} className={`rayguard-intro${leaving ? ' is-leaving' : ''}`}
    aria-label="RayGuard introduction" aria-describedby="rayguard-intro-description"
    onCancel={(event) => { event.preventDefault(); onComplete() }}>
    <div className="intro-topline"><span>Research preview</span>
      <button type="button" className="intro-skip" autoFocus onClick={onComplete}>Skip intro <ArrowRight size={17} /></button>
    </div>
    <div className="intro-scene">
      <div className="intro-copy"><h1>RayGuard</h1>
        <p id="rayguard-intro-description">Embedded Explosive Detection in Electronic Devices</p>
      </div>
      <div className="intro-media" aria-hidden="true">
        {failed && <img src={eyePoster} alt="" width="1920" height="1080" />}
        <video ref={video} src="/media/rayguard/eye-intro.mp4" muted playsInline preload="auto"
          tabIndex={-1} onError={() => { setFailed(true); finish() }} hidden={failed} />
      </div>
    </div>
    <div className="intro-bottomline"><span>{status}</span><span>Choose. Detect. Review.</span></div>
  </dialog>
}
