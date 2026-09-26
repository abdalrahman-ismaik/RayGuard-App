import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AnnotationComparison, Run } from '../types'

export interface ComparisonState {
  eligible: boolean
  loading: boolean
  comparison: AnnotationComparison | null
  error: string | null
  retry: () => void
}

export function useAnnotationComparison(run: Run | null): ComparisonState {
  const [attempt, setAttempt] = useState(0)
  const eligible = run?.scan.origin === 'dataset_demo' && run.scan.source?.dataset === 'IEDXray' && run.scan.source.split === 'test'
  // A comparison may finish on the server before the selected run poll catches up.
  // Wait for the local terminal state so it cannot briefly show then reload on completion.
  const id = eligible && run.state !== 'running' ? run.id : null
  // Polling refreshes the run object. Only an identity or execution transition needs a new comparison.
  const key = id ? `${id}:${run!.state}:${run!.completed_at ?? ''}:${attempt}` : null
  const [saved, setSaved] = useState<{ key: string; comparison: AnnotationComparison | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!id || !key) return
    let disposed = false
    void api.comparison(id).then(comparison => {
      if (comparison.run_id !== id) throw new Error('The reference response does not match this run. Retry the reference request.')
      if (!disposed) setSaved({ key, comparison, error: null })
    }).catch(cause => {
      if (!disposed) setSaved({ key, comparison: null, error: cause instanceof Error ? cause.message : 'Reference comparison is unavailable.' })
    })
    return () => { disposed = true }
  }, [id, key])
  // Never expose the previous scan's labels, even during the render before effect cleanup.
  const current = key && saved?.key === key ? saved : null
  return { eligible, loading: Boolean(id) && !current, comparison: current?.comparison ?? null, error: current?.error ?? null, retry: () => setAttempt(value => value + 1) }
}
