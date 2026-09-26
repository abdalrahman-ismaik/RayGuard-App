import { useEffect, useRef, useState } from 'react'
import { CheckCheck, Flag, LoaderCircle } from 'lucide-react'
import type { Review, Run } from '../types'

interface Props { run: Run; onReview: (id: string, value: Pick<Review, 'status' | 'note'>) => Promise<void>; onInspect: () => void }
const labels = { unreviewed: 'Unreviewed', reviewed: 'Reviewed', follow_up: 'Follow-up requested' }

export function ReviewPanel({ run, onReview, onInspect }: Props) {
  const [note, setNote] = useState(run.review?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentRun = useRef(run.id)
  currentRun.current = run.id
  useEffect(() => { setNote(run.review?.note ?? ''); setError(null) }, [run.id])
  const save = async (status: Review['status']) => {
    if (saving) return
    const id = run.id
    setSaving(true)
    setError(null)
    try { await onReview(id, { status, note }) }
    catch (cause) { if (currentRun.current === id) setError(cause instanceof Error ? cause.message : 'Review could not be saved. Try again.') }
    finally { setSaving(false) }
  }
  return <section className="review-panel" aria-label="Operator review" onFocusCapture={onInspect}>
    <div className="review-heading"><h3>Operator review</h3><span className={`review-status ${run.review?.status ?? 'unreviewed'}`} aria-live="polite">{labels[run.review?.status ?? 'unreviewed']}</span></div>
    <label htmlFor="review-note">Review note <span>(optional)</span></label>
    <textarea id="review-note" value={note} maxLength={1000} rows={2} placeholder="Record observations or follow-up needed…" onChange={(event) => setNote(event.target.value)} disabled={saving} />
    <div className="review-actions"><button type="button" className={run.state === 'succeeded' ? 'primary-button' : 'secondary-button'} disabled={saving} onClick={() => { void save('reviewed') }}>{saving ? <LoaderCircle size={15} className="spin" /> : <CheckCheck size={15} />}Mark reviewed</button>
      <button type="button" className="secondary-button" disabled={saving} onClick={() => { void save('follow_up') }}><Flag size={15} />Flag for follow-up</button></div>
    <p className="review-help">Records your review; does not clear or classify the item.</p>
    {error && <p className="export-error" role="alert">{error}</p>}
  </section>
}
