import { useEffect, useRef, useState } from 'react'

export const eyePoster = '/media/rayguard/eye-poster.jpg'

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Decorative activity mark. The caller owns the actual status and its accessible text. */
export function EyeMotion({ paused = false }: { paused?: boolean }) {
  const reduced = useReducedMotion()
  const [failed, setFailed] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const moving = !paused && !reduced && !failed

  useEffect(() => {
    const media = video.current
    if (!media) return
    let disposed = false
    const update = () => {
      if (document.hidden) media.pause()
      else void media.play().catch(() => { if (!disposed) setFailed(true) })
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', update)
      media.pause()
    }
  }, [moving])

  return <span className="eye-motion" aria-hidden="true">
    <img src={eyePoster} alt="" width="48" height="48" />
    {moving && <video ref={video} src="/media/rayguard/eye-loop.mp4" poster={eyePoster}
      muted playsInline loop preload="auto" tabIndex={-1} onError={() => setFailed(true)} />}
  </span>
}
