// Business annual report: review last year and set next year's price and production.
// Contract stub (data: AnnualReportData; result: JSON AnnualReportResult or 'skip').
import type { MinigameProps } from './types'

export function AnnualReport({ onDone }: MinigameProps) {
  return (
    <div className="annual-report">
      <button type="button" className="btn btn-primary" onClick={() => onDone('skip')}>
        Keep last year's plan
      </button>
    </div>
  )
}
