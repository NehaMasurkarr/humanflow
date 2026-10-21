import type { AnalyticsPage } from './types'
import { displayValue } from './format'
import { unitLabel } from '../lib/api'

export default function ResultsTable({
  page,
  unit,
}: {
  page: AnalyticsPage
  unit: string
}) {
  const kind = page.kind
  return (
    <details className="analytics-table">
      <summary>View data table ({page.items.length} rows)</summary>
      <div className="analytics-table-scroll">
        <table>
          <caption>
            {page.measure.label} · {unit} · source reporting periods
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {kind === 'trends' ? 'Period' : 'Geography / corridor'}
              </th>
              <th scope="col">
                {kind === 'distribution'
                  ? 'Corridors'
                  : kind === 'net'
                    ? 'Net estimate'
                    : 'Reported value'}
              </th>
              {kind === 'economics' && (
                <th scope="col">
                  {page.indicator?.name} (
                  {unitLabel(page.indicator?.unit ?? '')})
                </th>
              )}
              {kind === 'net' && (
                <>
                  <th scope="col">Incoming</th>
                  <th scope="col">Outgoing</th>
                </>
              )}
              <th scope="col">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((row, index) => (
              <tr key={`${row.label}:${index}`}>
                <th scope="row">
                  {row.label}
                  <small>
                    {row.year_start !== row.year_end
                      ? `${row.year_start} → ${row.year_end}`
                      : row.year_end}{' '}
                    · {row.dataset_id}
                  </small>
                </th>
                <td>{displayValue(row.value)}</td>
                {kind === 'economics' && (
                  <td>{displayValue(row.economic_value)}</td>
                )}
                {kind === 'net' && (
                  <>
                    <td>{displayValue(row.incoming)}</td>
                    <td>{displayValue(row.outgoing)}</td>
                  </>
                )}
                <td>
                  {row.observed} observed / {row.unavailable} unavailable
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
