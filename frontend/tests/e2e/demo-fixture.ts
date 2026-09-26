import type { DatasetDemo } from '../../src/types'

// Synthetic software state; contains no dataset pixels or predictions.
export const unconfiguredDemo: DatasetDemo = {
  configured: false, enabled: false, state: 'unconfigured', source_label: 'IEDXray published test split',
  total: 0, cursor: 0, next_name: null, current_name: null, batch_total: 0, completed_count: 0,
  last_run_id: null, confidence: 0.25, interval_seconds: 2, error: null,
}
